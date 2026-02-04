import { useRef, useCallback, useState, useEffect } from "react";

interface SilenceDetectionConfig {
  silenceThresholdSeconds: number;
  amplitudeThreshold: number;
  bufferDurationSeconds: number;
  onSilenceStart?: () => void;
  onSilenceEnd?: (bufferedAudio: Int16Array | null) => void;
  onSilenceProgress?: (secondsOfSilence: number) => void;
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

  const checkAmplitude = useCallback((): boolean => {
    if (!analyserRef.current) return false;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length / 255;

    return average > amplitudeThreshold;
  }, [amplitudeThreshold]);

  const handleSilenceCheck = useCallback(() => {
    if (!isActiveRef.current) return;

    const hasSpeech = checkAmplitude();
    const now = Date.now();

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
  }, [checkAmplitude, silenceThresholdSeconds, onSilenceStart, onSilenceEnd, onSilenceProgress, getBufferedAudio]);

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
