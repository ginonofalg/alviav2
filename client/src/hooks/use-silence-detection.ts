import { useRef, useCallback, useState, useEffect } from "react";

const CALIBRATION_CONFIG = {
  WARMUP_SAMPLES: 2,
  SAMPLE_COUNT: 8,
  MULTIPLIER: 3.0,
  MIN_THRESHOLD: 0.005,
  MAX_THRESHOLD: 0.12,
  FALLBACK_THRESHOLD: 0.01,
  MAX_CALIBRATION_TIME_MS: 5000,
  MAX_VARIANCE_RATIO: 3.0,
} as const;

interface CalibrationResult {
  baseline: number;
  threshold: number;
  sampleCount: number;
  variance: number;
}

interface SilenceDetectionConfig {
  silenceThresholdSeconds: number;
  amplitudeThreshold: number;
  bufferDurationSeconds: number;
  onSilenceStart?: () => void;
  onSilenceEnd?: (bufferedAudio: Int16Array | null) => void;
  onSilenceProgress?: (secondsOfSilence: number) => void;
  onCalibrationComplete?: (result: CalibrationResult) => void;
}

interface SilenceDetectionState {
  isSilent: boolean;
  silenceStartedAt: number | null;
  secondsOfSilence: number;
  isPausedDueToSilence: boolean;
}

export function useSilenceDetection(config: SilenceDetectionConfig) {
  const {
    silenceThresholdSeconds = 30,
    amplitudeThreshold = 0.01,
    bufferDurationSeconds = 2.5,
    onSilenceStart,
    onSilenceEnd,
    onSilenceProgress,
    onCalibrationComplete,
  } = config;

  const [state, setState] = useState<SilenceDetectionState>({
    isSilent: false,
    silenceStartedAt: null,
    secondsOfSilence: 0,
    isPausedDueToSilence: false,
  });

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<Int16Array[]>([]);
  const silenceStartTimeRef = useRef<number | null>(null);
  const isPausedDueToSilenceRef = useRef(false);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isActiveRef = useRef(false);

  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationTickCountRef = useRef<number>(0);
  const calibrationStartTimeRef = useRef<number | null>(null);
  const isCalibrating = useRef<boolean>(false);
  const dynamicThresholdRef = useRef<number | null>(null);

  const MAX_BUFFER_CHUNKS = Math.ceil((bufferDurationSeconds * 24000) / 4096);

  const addToBuffer = useCallback((int16Data: Int16Array) => {
    audioBufferRef.current.push(int16Data);
    while (audioBufferRef.current.length > MAX_BUFFER_CHUNKS) {
      audioBufferRef.current.shift();
    }
  }, [MAX_BUFFER_CHUNKS]);

  const getBufferedAudio = useCallback((): Int16Array | null => {
    if (audioBufferRef.current.length === 0) return null;
    
    const totalLength = audioBufferRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of audioBufferRef.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }, []);

  const clearBuffer = useCallback(() => {
    audioBufferRef.current = [];
  }, []);

  const getRawAmplitudeValue = useCallback((): number => {
    if (!analyserRef.current) return 0;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length / 255;
  }, []);

  const checkAmplitude = useCallback((): boolean => {
    const amplitude = getRawAmplitudeValue();
    const threshold = dynamicThresholdRef.current ?? amplitudeThreshold;
    return amplitude > threshold;
  }, [getRawAmplitudeValue, amplitudeThreshold]);

  const finishCalibration = useCallback((samples: number[]) => {
    const validSamples = samples.filter(s => !isNaN(s) && s >= 0);
    
    if (validSamples.length === 0) {
      dynamicThresholdRef.current = CALIBRATION_CONFIG.FALLBACK_THRESHOLD;
      console.log(`[SilenceDetection] Calibration failed (no valid samples), using fallback: ${CALIBRATION_CONFIG.FALLBACK_THRESHOLD}`);
      onCalibrationComplete?.({
        baseline: 0,
        threshold: CALIBRATION_CONFIG.FALLBACK_THRESHOLD,
        sampleCount: 0,
        variance: 0,
      });
      return;
    }

    const baseline = validSamples.reduce((a, b) => a + b, 0) / validSamples.length;
    const variance = validSamples.reduce((sum, s) => sum + Math.pow(s - baseline, 2), 0) / validSamples.length;
    const stdDev = Math.sqrt(variance);

    const varianceRatio = baseline > 0 ? stdDev / baseline : 0;
    const hasHighVariance = varianceRatio > CALIBRATION_CONFIG.MAX_VARIANCE_RATIO;

    let threshold: number;
    if (isNaN(baseline) || baseline <= 0 || hasHighVariance) {
      threshold = CALIBRATION_CONFIG.FALLBACK_THRESHOLD;
      console.log(`[SilenceDetection] Calibration unreliable (variance ratio: ${varianceRatio.toFixed(2)}), using fallback: ${threshold}`);
    } else {
      threshold = Math.max(
        CALIBRATION_CONFIG.MIN_THRESHOLD,
        Math.min(CALIBRATION_CONFIG.MAX_THRESHOLD, baseline * CALIBRATION_CONFIG.MULTIPLIER)
      );
      console.log(`[SilenceDetection] Calibrated — baseline: ${baseline.toFixed(4)}, threshold: ${threshold.toFixed(4)}, samples: ${validSamples.length}`);
    }

    dynamicThresholdRef.current = threshold;

    silenceStartTimeRef.current = null;
    isPausedDueToSilenceRef.current = false;

    onCalibrationComplete?.({
      baseline,
      threshold,
      sampleCount: validSamples.length,
      variance,
    });
  }, [onCalibrationComplete]);

  const handleSilenceCheck = useCallback(() => {
    if (!isActiveRef.current) return;

    const now = Date.now();

    if (isCalibrating.current) {
      calibrationTickCountRef.current += 1;

      if (calibrationStartTimeRef.current && 
          now - calibrationStartTimeRef.current > CALIBRATION_CONFIG.MAX_CALIBRATION_TIME_MS) {
        console.log(`[SilenceDetection] Calibration timeout, completing with ${calibrationSamplesRef.current.length} samples`);
        isCalibrating.current = false;
        finishCalibration(calibrationSamplesRef.current);
        return;
      }

      if (calibrationTickCountRef.current <= CALIBRATION_CONFIG.WARMUP_SAMPLES) {
        return;
      }

      const amplitude = getRawAmplitudeValue();
      calibrationSamplesRef.current.push(amplitude);
      console.log(`[SilenceDetection] Calibrating sample ${calibrationSamplesRef.current.length}: ${amplitude.toFixed(4)}`);

      if (calibrationSamplesRef.current.length >= CALIBRATION_CONFIG.SAMPLE_COUNT) {
        isCalibrating.current = false;
        finishCalibration(calibrationSamplesRef.current);
      }
      return;
    }

    const hasSpeech = checkAmplitude();

    if (!hasSpeech) {
      if (silenceStartTimeRef.current === null) {
        silenceStartTimeRef.current = now;
        setState(prev => ({ ...prev, isSilent: true, silenceStartedAt: now }));
      }

      const silenceDuration = (now - silenceStartTimeRef.current) / 1000;
      setState(prev => ({ ...prev, secondsOfSilence: silenceDuration }));
      onSilenceProgress?.(silenceDuration);

      if (silenceDuration >= silenceThresholdSeconds && !isPausedDueToSilenceRef.current) {
        isPausedDueToSilenceRef.current = true;
        setState(prev => ({ ...prev, isPausedDueToSilence: true }));
        onSilenceStart?.();
      }
    } else {
      if (silenceStartTimeRef.current !== null) {
        if (isPausedDueToSilenceRef.current) {
          const bufferedAudio = getBufferedAudio();
          isPausedDueToSilenceRef.current = false;
          setState(prev => ({ ...prev, isPausedDueToSilence: false }));
          onSilenceEnd?.(bufferedAudio);
        }
        
        silenceStartTimeRef.current = null;
        setState(prev => ({
          ...prev,
          isSilent: false,
          silenceStartedAt: null,
          secondsOfSilence: 0,
        }));
      }
    }
  }, [checkAmplitude, getRawAmplitudeValue, finishCalibration, silenceThresholdSeconds, onSilenceStart, onSilenceEnd, onSilenceProgress, getBufferedAudio]);

  const startMonitoring = useCallback((audioContext: AudioContext, mediaStream: MediaStream) => {
    if (isActiveRef.current) return;

    analyserRef.current = audioContext.createAnalyser();
    analyserRef.current.fftSize = 256;
    analyserRef.current.smoothingTimeConstant = 0.3;

    sourceNodeRef.current = audioContext.createMediaStreamSource(mediaStream);
    sourceNodeRef.current.connect(analyserRef.current);

    isActiveRef.current = true;
    silenceStartTimeRef.current = null;
    isPausedDueToSilenceRef.current = false;
    clearBuffer();

    calibrationSamplesRef.current = [];
    calibrationTickCountRef.current = 0;
    calibrationStartTimeRef.current = Date.now();
    isCalibrating.current = true;
    dynamicThresholdRef.current = null;

    console.log('[SilenceDetection] Starting ambient calibration...');

    checkIntervalRef.current = setInterval(handleSilenceCheck, 250);

    setState({
      isSilent: false,
      silenceStartedAt: null,
      secondsOfSilence: 0,
      isPausedDueToSilence: false,
    });
  }, [handleSilenceCheck, clearBuffer]);

  const stopMonitoring = useCallback(() => {
    isActiveRef.current = false;

    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    analyserRef.current = null;
    silenceStartTimeRef.current = null;
    isPausedDueToSilenceRef.current = false;
    clearBuffer();

    calibrationSamplesRef.current = [];
    calibrationTickCountRef.current = 0;
    calibrationStartTimeRef.current = null;
    isCalibrating.current = false;
    dynamicThresholdRef.current = null;

    setState({
      isSilent: false,
      silenceStartedAt: null,
      secondsOfSilence: 0,
      isPausedDueToSilence: false,
    });
  }, [clearBuffer]);

  const resetSilenceTimer = useCallback(() => {
    silenceStartTimeRef.current = null;
    isPausedDueToSilenceRef.current = false;
    setState(prev => ({
      ...prev,
      isSilent: false,
      silenceStartedAt: null,
      secondsOfSilence: 0,
      isPausedDueToSilence: false,
    }));
  }, []);

  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    ...state,
    startMonitoring,
    stopMonitoring,
    resetSilenceTimer,
    addToBuffer,
    getBufferedAudio,
    clearBuffer,
    isMonitoring: isActiveRef.current,
  };
}
