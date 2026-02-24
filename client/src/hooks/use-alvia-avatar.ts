import { useState, useEffect, useRef } from "react";
import {
  type AlviaAvatarState,
  ALVIA_AVATAR_VARIANTS,
  preloadAlviaAvatars,
} from "@/lib/alvia-avatar-registry";

const ROTATION_INTERVAL_MS = 10_000;

export interface AlviaAvatarSignals {
  isListening: boolean;
  isAiSpeaking: boolean;
  isPaused: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  isTextOnlyMode: boolean;
  silencePauseActive: boolean;
  isReconnecting: boolean;
  showQualitySwitchPrompt: boolean;
  aqGenerating: boolean;
  isFinalizingInterview: boolean;
  isCompletingAQ: boolean;
  readyPhase: boolean;
}

function resolveState(s: AlviaAvatarSignals): AlviaAvatarState {
  if (s.isReconnecting) return "reconnecting";
  if (s.isConnecting && !s.isReconnecting) return "connecting";
  if (s.showQualitySwitchPrompt && !s.isTextOnlyMode) return "noisy";
  if (s.aqGenerating || s.isFinalizingInterview || s.isCompletingAQ) return "thinking";
  if (s.isPaused) return "paused";
  if (s.silencePauseActive) return "silence";
  if (s.isAiSpeaking && s.isConnected) return "talking";
  if (s.isTextOnlyMode && s.isConnected && !s.isPaused) return "text_mode";
  if (s.isListening && !s.isAiSpeaking) return "listening";
  if (s.readyPhase && !s.isConnected) return "ready";
  return "offline";
}

export function useAlviaAvatar(signals: AlviaAvatarSignals): {
  imageUrl: string;
  state: AlviaAvatarState;
} {
  const state = resolveState(signals);
  const [variantIndex, setVariantIndex] = useState(0);
  const prevStateRef = useRef(state);

  useEffect(() => {
    preloadAlviaAvatars();
  }, []);

  useEffect(() => {
    if (prevStateRef.current !== state) {
      setVariantIndex(0);
      prevStateRef.current = state;
    }
  }, [state]);

  useEffect(() => {
    const variants = ALVIA_AVATAR_VARIANTS[state];
    if (variants.length <= 1) return;

    const interval = setInterval(() => {
      setVariantIndex((prev) => (prev + 1) % variants.length);
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [state]);

  const variants = ALVIA_AVATAR_VARIANTS[state];
  const imageUrl = variants[variantIndex % variants.length];

  return { imageUrl, state };
}
