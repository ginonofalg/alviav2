import { useRef, useState, useCallback } from "react";

export function useAudioPlayback() {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const suppressPlaybackRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return audioContextRef.current;
  }, []);

  const playNextChunk = useCallback((audioContext: AudioContext) => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      audioSourceRef.current = null;
      setIsAiSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsAiSpeaking(true);

    const chunk = audioQueueRef.current.shift()!;
    const audioBuffer = audioContext.createBuffer(1, chunk.length, 24000);
    audioBuffer.copyToChannel(chunk, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => playNextChunk(audioContext);
    audioSourceRef.current = source;
    source.start();
  }, []);

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

        if (!isPlayingRef.current) {
          const audioContext = await initAudioContext();
          if (audioContext.state === "running") {
            playNextChunk(audioContext);
          }
        }
      } catch (error) {
        console.error("Error playing audio:", error);
      }
    },
    [initAudioContext, playNextChunk],
  );

  const stopAiPlayback = useCallback(() => {
    audioQueueRef.current = [];
    suppressPlaybackRef.current = true;
    if (suppressTimeoutRef.current) {
      clearTimeout(suppressTimeoutRef.current);
    }
    suppressTimeoutRef.current = setTimeout(() => {
      suppressPlaybackRef.current = false;
      suppressTimeoutRef.current = null;
    }, 10000);
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.onended = null;
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch (_e) {}
      audioSourceRef.current = null;
    }
    isPlayingRef.current = false;
    setIsAiSpeaking(false);
  }, []);

  const clearSuppression = useCallback(() => {
    suppressPlaybackRef.current = false;
    if (suppressTimeoutRef.current) {
      clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = null;
    }
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
