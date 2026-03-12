import { useRef, useState, useCallback, useEffect } from "react";
import { isGenerationComplete } from "@/lib/audio-scheduling";

type ActiveSource = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  generation: number;
};

export function useAudioPlayback() {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const suppressPlaybackRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingHoldoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const masterGainRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<Set<ActiveSource>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const playbackGenerationRef = useRef<number>(0);
  const drainGenerationRef = useRef<number>(0);
  const isDrainingRef = useRef(false);

  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    if (!masterGainRef.current && audioContextRef.current) {
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  const scheduleChunk = useCallback(
    (audioContext: AudioContext, chunk: Float32Array) => {
      if (chunk.length === 0) return;

      const audioBuffer = audioContext.createBuffer(1, chunk.length, 24000);
      audioBuffer.copyToChannel(chunk, 0);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const chunkGain = audioContext.createGain();
      chunkGain.gain.value = 1;
      source.connect(chunkGain);
      chunkGain.connect(masterGainRef.current ?? audioContext.destination);

      const now = audioContext.currentTime;
      const when = nextStartTimeRef.current > now
        ? nextStartTimeRef.current
        : now + 0.015;
      nextStartTimeRef.current = when + audioBuffer.duration;

      source.start(when);

      if (speakingHoldoffRef.current) {
        clearTimeout(speakingHoldoffRef.current);
        speakingHoldoffRef.current = null;
      }
      isPlayingRef.current = true;
      setIsAiSpeaking(true);

      const generation = playbackGenerationRef.current;
      const entry: ActiveSource = {
        source,
        gain: chunkGain,
        generation,
      };
      activeSourcesRef.current.add(entry);

      source.onended = () => {
        activeSourcesRef.current.delete(entry);
        try {
          source.disconnect();
          chunkGain.disconnect();
        } catch (_e) {}

        if (entry.generation !== playbackGenerationRef.current) return;

        drainQueue();

        if (
          isGenerationComplete(
            activeSourcesRef.current,
            playbackGenerationRef.current,
            audioQueueRef.current.length,
          )
        ) {
          isPlayingRef.current = false;
          speakingHoldoffRef.current = setTimeout(() => {
            setIsAiSpeaking(false);
            speakingHoldoffRef.current = null;
          }, 150);
        }
      };
    },
    [],
  );

  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) return;
    isDrainingRef.current = true;
    const myGen = drainGenerationRef.current;
    try {
      const audioContext = await initAudioContext();

      if (myGen !== drainGenerationRef.current) return;
      if (audioContext.state !== "running") return;

      let scheduledThisPass = 0;
      while (audioQueueRef.current.length > 0) {
        if (myGen !== drainGenerationRef.current) return;

        const now = audioContext.currentTime;
        const scheduleAhead = nextStartTimeRef.current - now;

        if (scheduledThisPass > 0 && scheduleAhead > 0.2) break;

        const chunk = audioQueueRef.current.shift()!;
        scheduleChunk(audioContext, chunk);
        scheduledThisPass++;
      }
    } catch (_e) {
    } finally {
      isDrainingRef.current = false;
    }
  }, [initAudioContext, scheduleChunk]);

  const playAudio = useCallback(
    async (base64Audio: string) => {
      try {
        if (suppressPlaybackRef.current) return;

        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        audioQueueRef.current.push(float32Array);
        drainQueue();
      } catch (error) {
        console.error("Error playing audio:", error);
      }
    },
    [drainQueue],
  );

  const stopAiPlayback = useCallback(() => {
    playbackGenerationRef.current++;
    drainGenerationRef.current++;

    audioQueueRef.current = [];
    suppressPlaybackRef.current = true;

    if (speakingHoldoffRef.current) {
      clearTimeout(speakingHoldoffRef.current);
      speakingHoldoffRef.current = null;
    }
    setIsAiSpeaking(false);
    isPlayingRef.current = false;

    if (suppressTimeoutRef.current) {
      clearTimeout(suppressTimeoutRef.current);
    }
    suppressTimeoutRef.current = setTimeout(() => {
      suppressPlaybackRef.current = false;
      suppressTimeoutRef.current = null;
    }, 10000);

    const audioContext = audioContextRef.current;
    if (audioContext) {
      const now = audioContext.currentTime;
      for (const entry of activeSourcesRef.current) {
        const { source, gain } = entry;
        try {
          if (typeof gain.gain.cancelAndHoldAtTime === "function") {
            gain.gain.cancelAndHoldAtTime(now);
          } else {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
          }
          gain.gain.linearRampToValueAtTime(0, now + 0.01);
          source.stop(now + 0.015);
        } catch (_e) {}
      }
      activeSourcesRef.current.clear();
    }

    nextStartTimeRef.current = 0;
  }, []);

  const clearSuppression = useCallback(() => {
    suppressPlaybackRef.current = false;
    if (suppressTimeoutRef.current) {
      clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (speakingHoldoffRef.current) {
        clearTimeout(speakingHoldoffRef.current);
        speakingHoldoffRef.current = null;
      }
      if (suppressTimeoutRef.current) {
        clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = null;
      }

      for (const { source, gain } of activeSourcesRef.current) {
        try {
          source.onended = null;
          source.stop();
          source.disconnect();
          gain.disconnect();
        } catch (_e) {}
      }
      activeSourcesRef.current.clear();

      if (masterGainRef.current) {
        try {
          masterGainRef.current.disconnect();
        } catch (_e) {}
        masterGainRef.current = null;
      }

      nextStartTimeRef.current = 0;
      drainGenerationRef.current++;
      audioQueueRef.current = [];
      isPlayingRef.current = false;
    };
  }, []);

  return {
    isAiSpeaking,
    initAudioContext,
    playAudio,
    stopAiPlayback,
    clearSuppression,
    audioContextRef,
  };
}
