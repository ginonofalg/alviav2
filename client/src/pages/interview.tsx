import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  X,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Keyboard,
  MessageSquareText,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useSilenceDetection } from "@/hooks/use-silence-detection";
import { useAudioPlayback } from "@/hooks/use-audio-playback";
import { useReconnection, RECONNECT_MAX_ATTEMPTS } from "@/hooks/use-reconnection";
import { useAlviaAvatar, type AlviaAvatarSignals } from "@/hooks/use-alvia-avatar";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type {
  InterviewSession,
  Question,
  Collection,
  InterviewTemplate,
  Respondent,
} from "@shared/schema";

interface InterviewData {
  session: InterviewSession;
  collection: Collection;
  template: InterviewTemplate;
  questions: Question[];
  respondent?: Respondent;
  features?: {
    additionalQuestionsEnabled?: boolean;
  };
  aqState?: {
    isInAQPhase: boolean;
    aqQuestions: Array<{ questionText: string; rationale: string; index: number }>;
    currentAQIndex: number;
  };
}

interface TranscriptEntry {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
  isStreaming?: boolean;
  interrupted?: boolean;
}

function WaveformVisualizer({
  isActive,
  isAiSpeaking,
}: {
  isActive: boolean;
  isAiSpeaking?: boolean;
}) {
  const barHeights = useMemo(
    () => Array.from({ length: 24 }, () => Math.random() * 48 + 8),
    [],
  );

  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {barHeights.map((peakHeight, i) => (
        <motion.div
          key={i}
          className={`w-1 rounded-full ${
            isAiSpeaking ? "bg-green-500" : isActive ? "bg-primary" : "bg-muted"
          }`}
          animate={
            isActive || isAiSpeaking
              ? { height: [8, peakHeight, 8] }
              : { height: 8 }
          }
          transition={{
            duration: 0.6,
            repeat: isActive || isAiSpeaking ? Infinity : 0,
            delay: i * 0.03,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

const AVATAR_BG_COLORS: Record<string, string> = {
  listening: "bg-primary",
  talking: "bg-primary",
  paused: "bg-yellow-500",
  connecting: "bg-muted cursor-wait",
  text_mode: "bg-green-500",
  silence: "bg-primary/80",
  reconnecting: "bg-muted cursor-wait",
  noisy: "bg-orange-500",
  thinking: "bg-muted",
  ready: "bg-primary",
  offline: "bg-muted",
};

const AVATAR_PULSE_STATES = new Set(["listening", "talking", "text_mode", "silence"]);

const AVATAR_PULSE_COLORS: Record<string, string> = {
  listening: "border-primary",
  talking: "border-primary",
  text_mode: "border-green-500",
  silence: "border-primary/60",
};

const AVATAR_DISABLED_STATES = new Set(["connecting", "reconnecting", "thinking"]);

function MicButton({
  signals,
  onToggle,
}: {
  signals: AlviaAvatarSignals;
  onToggle: () => void;
}) {
  const { imageUrl, state } = useAlviaAvatar(signals);

  const tooltip = state === "listening" ? "Click to pause the interview"
    : state === "talking" ? "Alvia is speaking"
    : state === "paused" ? "Click to resume the interview"
    : state === "connecting" || state === "reconnecting" ? "Connecting..."
    : state === "thinking" ? "Processing..."
    : state === "text_mode" ? "Text-only mode active"
    : state === "silence" ? "Silence detected — click to pause"
    : state === "noisy" ? "Noisy environment detected"
    : state === "ready" ? "Click to start the interview"
    : "Click to start the interview";

  return (
    <motion.button
      onClick={onToggle}
      disabled={AVATAR_DISABLED_STATES.has(state)}
      aria-label={tooltip}
      title={tooltip}
      className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors ${AVATAR_BG_COLORS[state] || "bg-muted"}`}
      whileTap={{ scale: 0.95 }}
      data-testid="button-mic-toggle"
    >
      {AVATAR_PULSE_STATES.has(state) && (
        <motion.div
          className={`absolute inset-0 rounded-full border-4 ${AVATAR_PULSE_COLORS[state] || "border-primary"}`}
          animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      <div className="w-16 h-16 rounded-full bg-white pointer-events-none select-none flex items-center justify-center overflow-hidden">
        <img
          src={imageUrl}
          alt={`Alvia ${state}`}
          className="w-full h-full object-contain"
          draggable={false}
          data-testid="img-alvia-avatar"
        />
      </div>
    </motion.button>
  );
}

function TranscriptPanel({ entries }: { entries: TranscriptEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries]);

  return (
    <ScrollArea className="h-64 rounded-lg border bg-card p-4">
      {entries.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Transcript will appear here as you speak...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, index) => (
            <div
              key={`${entry.speaker}-${entry.timestamp}-${index}`}
              className={`flex gap-3 ${entry.speaker === "respondent" ? "justify-end" : ""}`}
            >
              {entry.speaker === "alvia" && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  entry.speaker === "alvia"
                    ? "bg-muted text-foreground"
                    : "bg-primary text-primary-foreground"
                } ${entry.interrupted ? "opacity-70" : ""}`}
              >
                <p className="text-sm leading-relaxed">
                  {entry.text}{entry.interrupted ? "..." : ""}
                </p>
                <span className="text-xs opacity-70 mt-1 block">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </ScrollArea>
  );
}

export default function InterviewPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const {
    isAiSpeaking,
    initAudioContext,
    playAudio,
    stopAiPlayback,
    clearSuppression,
    audioContextRef,
  } = useAudioPlayback();
  // Refs to track state values - avoids stale closures in callbacks
  const isListeningRef = useRef(false);
  const isPausedRef = useRef(false);
  const isTextOnlyModeRef = useRef(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestionText, setCurrentQuestionText] = useState<string>("");
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [highlightNextButton, setHighlightNextButton] = useState(false);
  const [isTextOnlyMode, setIsTextOnlyMode] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "next" | "complete" | "additional_questions";
  }>({ open: false, type: "next" });
  const [readyPhase, setReadyPhase] = useState(true);
  
  // Interview finalizing state (shown when declining AQs while summary generates)
  const [isFinalizingInterview, setIsFinalizingInterview] = useState(false);

  // Additional Questions state
  const [isInAQPhase, setIsInAQPhase] = useState(false);
  const [aqQuestions, setAqQuestions] = useState<Array<{ questionText: string; rationale: string; index: number }>>([]);
  const [currentAQIndex, setCurrentAQIndex] = useState(0);
  const [aqGenerating, setAqGenerating] = useState(false);
  const [aqMessage, setAqMessage] = useState<string | null>(null);
  const [isCompletingAQ, setIsCompletingAQ] = useState(false);
  
  // Transcription quality state (noisy environment detection)
  const [transcriptionQualityScore, setTranscriptionQualityScore] = useState(100);
  const [transcriptionQualityWarning, setTranscriptionQualityWarning] = useState<string | null>(null);
  const [showQualitySwitchPrompt, setShowQualitySwitchPrompt] = useState(false);
  
  // Silence detection state - pauses audio streaming after 30s of silence to save resources
  const [silencePauseActive, setSilencePauseActive] = useState(false);
  
  // VAD eagerness state - for debugging indicator (controlled by VITE_SHOW_VAD_INDICATOR)
  const [vadEagerness, setVadEagerness] = useState<"auto" | "low" | "high">("auto");
  const showVadIndicator = import.meta.env.VITE_SHOW_VAD_INDICATOR !== "false";
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track when WebSocket opened for disconnect diagnostics
  const wsOpenTimeRef = useRef<number>(0);
  const lastHeartbeatSentRef = useRef<number>(0);
  
  const allowReconnectRef = useRef(true);
  const isUnmountingRef = useRef(false);
  // Forward declaration - will be set after connectWebSocket is defined
  const connectWebSocketRef = useRef<(() => void) | null>(null);

  const {
    isReconnecting,
    reconnectAttempt,
    isReconnectingRef,
    reconnectAttemptRef,
    reconnectTokenRef,
    reconnectTimeoutRef,
    wasListeningBeforeDisconnectRef,
    shouldAutoResumeRef,
    isAttemptInFlightRef,
    clearReconnectTimer,
    clearConnectionTimeout,
    stopReconnect,
    scheduleReconnect,
    startReconnect,
    onReconnectSuccess,
  } = useReconnection({
    wsRef,
    connectWebSocketRef,
    allowReconnectRef,
    isUnmountingRef,
  });

  const HEARTBEAT_INTERVAL_MS = 30_000; // Send heartbeat every 30 seconds
  const SILENCE_THRESHOLD_SECONDS = 30; // Pause audio streaming after 30 seconds of silence

  // Silence detection - pauses audio streaming to save resources during extended silence
  const handleSilenceStart = useCallback(() => {
    console.log("[Interview] Extended silence detected - pausing audio streaming");
    setSilencePauseActive(true);
    
    // Notify server that client is pausing due to silence
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: "client_silence_detected",
        durationSeconds: SILENCE_THRESHOLD_SECONDS,
      }));
    }
  }, []);

  const handleCalibrationComplete = useCallback(({ baseline, threshold, sampleCount, variance }: { 
    baseline: number; 
    threshold: number; 
    sampleCount: number;
    variance: number;
  }) => {
    console.log(`[Interview] Mic calibrated — baseline: ${baseline.toFixed(4)}, threshold: ${threshold.toFixed(4)}, samples: ${sampleCount}`);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "client_calibration_complete",
        baseline,
        threshold,
        sampleCount,
        variance,
      }));
    }
  }, []);

  const handleSilenceEnd = useCallback((bufferedAudio: Int16Array | null) => {
    console.log("[Interview] Speech resumed - sending buffered audio first");
    setSilencePauseActive(false);
    
    // Send buffered audio to server first to capture the beginning of speech
    if (wsRef.current?.readyState === WebSocket.OPEN && bufferedAudio && bufferedAudio.length > 0) {
      // Convert Int16Array to base64
      const uint8Array = new Uint8Array(bufferedAudio.buffer);
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Audio = btoa(binary);
      
      // Send buffered audio with flag indicating it's pre-captured
      wsRef.current.send(JSON.stringify({
        type: "client_resuming_audio",
        bufferedAudio: base64Audio,
      }));
    }
  }, []);

  const {
    isPausedDueToSilence,
    isSilent,
    secondsOfSilence,
    startMonitoring: startSilenceMonitoring,
    stopMonitoring: stopSilenceMonitoring,
    addToBuffer: addAudioToSilenceBuffer,
    resetSilenceTimer,
  } = useSilenceDetection({
    silenceThresholdSeconds: SILENCE_THRESHOLD_SECONDS,
    amplitudeThreshold: 0.01,
    bufferDurationSeconds: 2.5,
    onSilenceStart: handleSilenceStart,
    onSilenceEnd: handleSilenceEnd,
    onCalibrationComplete: handleCalibrationComplete,
  });

  const { data: interviewData, isLoading } = useQuery<InterviewData>({
    queryKey: ["/api/interview", sessionId],
    enabled: !!sessionId,
  });

  const session = interviewData?.session;
  const collection = interviewData?.collection;
  const questions = interviewData?.questions;
  const respondent = interviewData?.respondent;
  const currentQuestion = questions?.[currentQuestionIndex];
  const progress = isInAQPhase
    ? ((currentAQIndex + 1) / aqQuestions.length) * 100
    : totalQuestions > 0
      ? ((currentQuestionIndex + 1) / totalQuestions) * 100
      : 0;
  
  // Check if this is a resumed session (already started before)
  // Detect via: status (in_progress/paused), currentQuestionIndex > 0, or existing questionStates
  const isResumedSession = 
    session?.status === "in_progress" || 
    session?.status === "paused" ||
    (session?.currentQuestionIndex ?? 0) > 0 ||
    !!session?.questionStates;

  // Track if we've auto-started for resumed sessions
  const hasAutoStartedRef = useRef(false);

  // Restore AQ state from initial API response (for page refresh during AQ phase)
  useEffect(() => {
    if (interviewData?.aqState?.isInAQPhase) {
      setIsInAQPhase(true);
      setAqQuestions(interviewData.aqState.aqQuestions);
      setCurrentAQIndex(interviewData.aqState.currentAQIndex);
    }
  }, [interviewData?.aqState]);

  // Stop audio capture - defined early for use in message handlers
  const stopAudioCapture = useCallback(() => {
    // Stop silence monitoring
    stopSilenceMonitoring();
    setSilencePauseActive(false);
    
    if (processorRef.current) {
      // Null out onaudioprocess BEFORE disconnect to prevent any final queued callback
      // from sending audio after the WebSocket is closed
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, [stopSilenceMonitoring]);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (!sessionId || wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const voiceProvider = collection?.voiceProvider || "openai";
    const wsUrl = `${protocol}//${window.location.host}/ws/interview?sessionId=${sessionId}&provider=${voiceProvider}`;

    console.log("[Interview] Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Interview] WebSocket connected");
      wsOpenTimeRef.current = Date.now();
      // Start heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const pingTime = Date.now();
          ws.send(JSON.stringify({ type: 'heartbeat.ping', sentAt: pingTime }));

          // Log if heartbeat is significantly delayed (timer throttled by browser)
          if (lastHeartbeatSentRef.current) {
            const actualInterval = pingTime - lastHeartbeatSentRef.current;
            if (actualInterval > HEARTBEAT_INTERVAL_MS * 2) {
              console.warn("[Interview] Heartbeat delayed", {
                expected: HEARTBEAT_INTERVAL_MS,
                actual: actualInterval,
                ratio: (actualInterval / HEARTBEAT_INTERVAL_MS).toFixed(1),
                visibilityState: document.visibilityState,
              });
            }
          }
          lastHeartbeatSentRef.current = pingTime;
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("[Interview] Error parsing message:", error);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      // Enhanced diagnostic logging for disconnect investigation
      const diagnostics = {
        closeCode: event.code,
        closeReason: event.reason,
        wasClean: event.wasClean,
        onLine: navigator.onLine,
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
        timeSinceOpen: wsOpenTimeRef.current ? Date.now() - wsOpenTimeRef.current : null,
      };
      console.log("[Interview] WebSocket closed", diagnostics);

      // Send diagnostic data to server via sendBeacon (works even during page unload)
      if (sessionId) {
        try {
          navigator.sendBeacon(
            `/api/sessions/${sessionId}/disconnect-log`,
            new Blob([JSON.stringify(diagnostics)], { type: "application/json" })
          );
        } catch (e) {
          // Best effort - sendBeacon may not be available in all contexts
        }
      }

      setIsConnected(false);
      setIsConnecting(false);
      
      // Save listening state before clearing it (for reconnect logic)
      // Use refs to avoid stale closure issue (connectWebSocket doesn't include these in deps)
      wasListeningBeforeDisconnectRef.current = isListeningRef.current;
      // Determine if we should auto-resume on reconnect
      shouldAutoResumeRef.current = isListeningRef.current && !isPausedRef.current && !isTextOnlyModeRef.current;
      
      setIsListening(false);
      // CRITICAL: Stop audio capture to prevent leaked/orphaned audio processors
      // Without this, the ScriptProcessor and MediaStream continue running in the background
      // and will send audio through any new WebSocket connection, causing doubled audio
      stopAudioCapture();
      // Reset hasSentResumeRef so reconnection can properly resume
      hasSentResumeRef.current = false;
      // Stop heartbeat on disconnect
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // Detect unexpected disconnect and trigger reconnection
      // Close codes: 1005 = no status, 1006 = abnormal, 1011-1013 = server errors
      const isUnexpectedClose = 
        allowReconnectRef.current && 
        !isUnmountingRef.current &&
        [1005, 1006, 1011, 1012, 1013].includes(event.code);
      
      // Clear connection timeout and in-flight flag on any close
      clearConnectionTimeout();
      isAttemptInFlightRef.current = false;
      
      if (isUnexpectedClose) {
        // If we're already reconnecting, schedule the next attempt (exponential backoff)
        // Use refs to avoid stale closure issues
        if (isReconnectingRef.current && reconnectAttemptRef.current > 0) {
          // Capture current token for this reconnect session
          const currentToken = reconnectTokenRef.current;
          console.log(`[Interview] Reconnect attempt ${reconnectAttemptRef.current} failed, scheduling next attempt`);
          scheduleReconnect(reconnectAttemptRef.current + 1, currentToken);
        } else {
          console.log("[Interview] Unexpected close detected, starting reconnection");
          startReconnect();
        }
      } else if (isReconnectingRef.current) {
        // Expected close during reconnection (e.g., session terminated) - stop reconnecting
        stopReconnect();
      }
    };

    ws.onerror = (error) => {
      console.error("[Interview] WebSocket error:", error);
      setIsConnecting(false);
      
      // If reconnecting, set up fallback scheduling in case onclose doesn't fire
      if (isReconnectingRef.current && reconnectAttemptRef.current > 0 && 
          allowReconnectRef.current && !isUnmountingRef.current) {
        console.log(`[Interview] WebSocket error during reconnect attempt ${reconnectAttemptRef.current}`);
        // Use a short delay fallback to schedule next attempt if onclose doesn't fire
        // onclose typically fires, but this ensures the loop doesn't stall
        const currentAttempt = reconnectAttemptRef.current;
        const currentToken = reconnectTokenRef.current;
        setTimeout(() => {
          // Only schedule if token matches and no new attempt has been scheduled
          if (reconnectTokenRef.current === currentToken && 
              reconnectAttemptRef.current === currentAttempt &&
              isReconnectingRef.current &&
              !reconnectTimeoutRef.current) {
            console.log("[Interview] onerror fallback: scheduling next attempt (onclose may not have fired)");
            scheduleReconnect(currentAttempt + 1, currentToken);
          }
        }, 100);
      } else if (!isReconnectingRef.current) {
        // Only show error toast for non-reconnection errors
        toast({
          title: "Connection error",
          description: "Failed to connect to voice service. Please try again.",
          variant: "destructive",
        });
      }
    };
  }, [sessionId, collection?.voiceProvider, toast, stopAudioCapture]);

  // Set ref so reconnection helpers can call connectWebSocket
  connectWebSocketRef.current = connectWebSocket;

  const handleWebSocketMessage = useCallback(
    (message: any) => {
      switch (message.type) {
        case "connected":
          console.log("[Interview] Session connected:", message);
          setIsConnected(true);
          setIsConnecting(false);
          // Only set isListening true if NOT a resumed session
          // For resumed sessions, audio capture hasn't started yet - user needs to click mic
          if (!message.isResumed) {
            setIsListening(true);
          }
          setCurrentQuestionIndex(message.questionIndex || 0);
          setTotalQuestions(message.totalQuestions || 0);
          if (message.currentQuestion) {
            setCurrentQuestionText(message.currentQuestion);
          }
          // Pre-warm the audio context so it's ready for playback, then signal server
          // This must happen in response to user interaction (which started the interview)
          initAudioContext().then(() => {
            console.log("[Interview] Audio context ready, signaling server");
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "audio_ready" }));
            }
          }).catch(console.error);
          // Restore persisted transcript on resume
          if (
            message.isResumed &&
            message.persistedTranscript &&
            Array.isArray(message.persistedTranscript)
          ) {
            const restoredEntries: TranscriptEntry[] =
              message.persistedTranscript.map((entry: any) => ({
                speaker: entry.speaker,
                text: entry.text,
                timestamp: entry.timestamp,
              }));
            setTranscript(restoredEntries);
          }
          // Restore AQ state on reconnect if in AQ phase
          if (message.isInAQPhase && message.aqQuestions) {
            setIsInAQPhase(true);
            setAqQuestions(message.aqQuestions);
            if (typeof message.currentAQIndex === 'number') {
              setCurrentAQIndex(message.currentAQIndex);
            }
          }
          // Sync VAD eagerness state on connect/reconnect
          if (message.vadEagerness === "auto" || message.vadEagerness === "low" || message.vadEagerness === "high") {
            setVadEagerness(message.vadEagerness);
          }
          
          // Handle reconnection: clear reconnect state and auto-resume if appropriate
          // Use ref to avoid stale closure
          if (isReconnectingRef.current) {
            console.log("[Interview] Reconnection successful");
            onReconnectSuccess();
            
            // Auto-resume audio capture if we were listening before disconnect
            // and the server says we should (awaitingResume indicates restored session)
            if (shouldAutoResumeRef.current && !message.isPaused) {
              console.log("[Interview] Auto-resuming audio capture after reconnect");
              startAudioCapture().then((success) => {
                if (success) {
                  setIsListening(true);
                  // If server is awaiting resume, send resume_interview
                  if (message.awaitingResume) {
                    wsRef.current?.send(JSON.stringify({ type: "resume_interview" }));
                  }
                } else {
                  console.warn("[Interview] Failed to auto-resume audio capture");
                }
                shouldAutoResumeRef.current = false;
              });
            } else {
              // Reset flag if we're not auto-resuming (e.g., paused state)
              shouldAutoResumeRef.current = false;
            }
          }
          break;

        case "audio":
          playAudio(message.delta);
          break;

        case "audio_done":
          clearSuppression();
          break;

        case "ai_transcript":
          // Stream directly into transcript - add new entry or update existing streaming entry
          setTranscript((prev) => {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry && lastEntry.speaker === "alvia" && lastEntry.isStreaming) {
              // Update the streaming entry
              return [
                ...prev.slice(0, -1),
                { ...lastEntry, text: lastEntry.text + message.delta },
              ];
            } else {
              // Create new streaming entry
              return [
                ...prev,
                {
                  speaker: "alvia",
                  text: message.delta,
                  timestamp: Date.now(),
                  isStreaming: true,
                },
              ];
            }
          });
          break;

        case "ai_transcript_done":
          // Mark streaming entry as complete and use the final refined transcript
          setTranscript((prev) => {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry && lastEntry.speaker === "alvia" && lastEntry.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastEntry, text: message.transcript || lastEntry.text, isStreaming: false },
              ];
            }
            return prev;
          });
          break;

        case "user_transcript":
          // Add user transcript to entries
          // Insert BEFORE any currently streaming AI entry since the user spoke first
          if (message.transcript) {
            setTranscript((prev) => {
              const newEntry = {
                speaker: "respondent" as const,
                text: message.transcript,
                timestamp: Date.now(),
              };
              
              // If the last entry is a streaming AI response, insert user transcript before it
              // This ensures proper conversational order: user speaks -> AI responds
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.speaker === "alvia" && lastEntry.isStreaming) {
                return [
                  ...prev.slice(0, -1),
                  newEntry,
                  lastEntry,
                ];
              }
              
              return [...prev, newEntry];
            });
          }
          break;

        case "user_speaking_started":
          stopAiPlayback();
          setTranscript((prev) => {
            // Find the last Alvia entry (streaming or finalized) and mark interrupted
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].speaker === "alvia") {
                const updated = [...prev];
                updated[i] = { ...updated[i], interrupted: true };
                return updated;
              }
            }
            return prev;
          });
          break;

        case "user_speaking_stopped":
          // Safe to clear suppression: by the time the user finishes speaking,
          // the provider has long since cancelled the interrupted response and
          // all stale audio deltas have been discarded. New audio from the
          // upcoming response should play normally.
          clearSuppression();
          break;

        case "question_changed":
          setCurrentQuestionIndex(message.questionIndex);
          if (message.currentQuestion) {
            setCurrentQuestionText(message.currentQuestion);
          }
          setHighlightNextButton(false); // Reset highlight when moving to next question
          break;

        case "interview_complete":
          // Clear the fallback timeout if set
          if (wsRef.current && (wsRef.current as any)._completeTimeoutId) {
            clearTimeout((wsRef.current as any)._completeTimeoutId);
          }
          setAqGenerating(false);
          setIsInAQPhase(false);
          setIsCompletingAQ(false);
          setIsFinalizingInterview(false);
          toast({
            title: "Interview completed",
            description: "Thank you for participating!",
          });
          // Navigate to review page instead of complete page
          navigate(`/review/${sessionId}`);
          break;

        case "additional_questions_generating":
          setAqGenerating(true);
          setAqMessage(message.message || "Generating additional questions...");
          break;

        case "additional_questions_ready":
          setAqGenerating(false);
          setIsInAQPhase(true);
          setAqQuestions(message.questions || []);
          setCurrentAQIndex(0);
          setAqMessage(null);
          toast({
            title: `${message.questionCount} additional question${message.questionCount !== 1 ? 's' : ''} ready`,
            description: "Let's explore a few more topics.",
          });
          break;

        case "additional_questions_none":
          // Transition to the "completing" overlay which shows "Barbara is finishing up her notes..."
          // This provides visual feedback that the app is still processing (server is awaiting summaries)
          setAqGenerating(false);
          setIsCompletingAQ(true);
          break;

        case "additional_question_started":
          setCurrentAQIndex(message.questionIndex);
          setCurrentQuestionText(message.questionText);
          break;

        case "prompt_additional_questions_consent":
          // Server is prompting us to show the AQ consent dialog
          // This handles the race condition where next_question arrives on the last question
          const maxAQ = collection?.maxAdditionalQuestions ?? 1;
          const aqFeatureEnabled = interviewData?.features?.additionalQuestionsEnabled !== false;
          if (maxAQ > 0 && aqFeatureEnabled && !isInAQPhase) {
            setConfirmDialog({ open: true, type: "additional_questions" });
          } else {
            // AQs not applicable, complete normally
            handleEndInterviewConfirmed();
          }
          break;

        case "error":
          toast({
            title: "Error",
            description: message.message || "An error occurred",
            variant: "destructive",
          });
          break;

        case "disconnected":
          setIsConnected(false);
          setIsListening(false);
          break;

        case "barbara_guidance":
          // Barbara is providing guidance to Alvia
          console.log("[Interview] Barbara guidance:", message);
          if (message.highlightNextQuestion) {
            setHighlightNextButton(true);
          }
          break;

        case "transcription_quality_warning":
          // Noisy environment detected - show quality warning
          console.log("[Interview] Transcription quality warning:", message);
          setTranscriptionQualityScore(message.qualityScore ?? 50);
          if (message.issues && message.issues.length > 0) {
            setTranscriptionQualityWarning(
              "Having trouble hearing clearly. Consider switching to text input."
            );
            setShowQualitySwitchPrompt(true);
          } else if ((message.qualityScore ?? 100) >= 80) {
            setTranscriptionQualityWarning(null);
            setShowQualitySwitchPrompt(false);
          }
          break;

        case "heartbeat.pong":
          // Server acknowledged heartbeat - connection is healthy
          break;

        case "vad_eagerness_update":
          // VAD eagerness changed - update indicator state
          setVadEagerness(message.eagerness);
          break;

        case "session_warning":
          // Session is about to be terminated due to inactivity
          toast({
            title: "Session Inactive",
            description: message.message || "Your session will end soon due to inactivity.",
            variant: "destructive",
          });
          break;

        case "session_terminated":
          // Session was terminated by server
          console.log("[Interview] Session terminated:", message.reason);
          // Prevent reconnection attempts - session is intentionally ended
          allowReconnectRef.current = false;
          stopReconnect();
          setIsFinalizingInterview(false);
          toast({
            title: "Session Ended",
            description: message.message || "Your interview session has ended.",
            variant: message.canResume ? "default" : "destructive",
          });
          // Stop audio capture
          stopAudioCapture();
          // Navigate back - user can resume if allowed
          if (message.canResume) {
            navigate(`/sessions/${sessionId}`);
          } else {
            navigate(`/review/${sessionId}`);
          }
          break;
      }
    },
    [playAudio, toast, navigate, stopAudioCapture, initAudioContext, clearSuppression, onReconnectSuccess],
  );

  // Track silence pause state in a ref for use in audio processor callback
  const silencePauseActiveRef = useRef(false);
  useEffect(() => {
    silencePauseActiveRef.current = silencePauseActive;
  }, [silencePauseActive]);

  // Sync refs with state for stable closures in callbacks (ws.onclose, onaudioprocess, etc.)
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  useEffect(() => {
    isTextOnlyModeRef.current = isTextOnlyMode;
  }, [isTextOnlyMode]);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    // Defensive cleanup FIRST: stop any orphaned audio from previous session
    // This prevents doubled audio processors after reconnection
    // Placed before the guard to handle edge cases where refs weren't properly cleared
    if (processorRef.current) {
      console.log("[Interview] Cleaning up orphaned audio processor");
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      console.log("[Interview] Cleaning up orphaned media stream");
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    try {
      // Initialize and resume audio context (handles browser autoplay policy)
      const audioContext = await initAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Start silence monitoring to detect extended periods of silence
      startSilenceMonitoring(audioContext, stream);

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
          return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32 to Int16
        const int16Array = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Always add to buffer for silence detection resumption
        addAudioToSilenceBuffer(int16Array);

        // Skip sending audio if silence pause is active
        // The silence detection hook will send buffered audio when speech resumes
        if (silencePauseActiveRef.current) {
          return;
        }

        // Convert to base64
        const uint8Array = new Uint8Array(int16Array.buffer);
        let binary = "";
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Audio = btoa(binary);

        // Send to server
        wsRef.current.send(
          JSON.stringify({
            type: "audio",
            audio: base64Audio,
          }),
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      return true;
    } catch (error) {
      console.error("[Interview] Error starting audio capture:", error);
      return false;
    }
  }, [initAudioContext, startSilenceMonitoring, addAudioToSilenceBuffer]);


  // Initialize question text from query data
  useEffect(() => {
    if (currentQuestion && !currentQuestionText) {
      setCurrentQuestionText(currentQuestion.questionText);
    }
    if (questions && totalQuestions === 0) {
      setTotalQuestions(questions.length);
    }
  }, [currentQuestion, questions, currentQuestionText, totalQuestions]);

  // Track if we've sent the resume message for this session
  const hasSentResumeRef = useRef(false);

  // Auto-connect WebSocket for resumed sessions (skip ready phase)
  // Note: Audio capture is NOT started automatically due to browser autoplay policies
  // requiring user interaction. The user can click the mic button to start audio.
  useEffect(() => {
    if (isResumedSession && !isLoading && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      setReadyPhase(false);
      // Initialize currentQuestionIndex from session data to avoid showing question 1
      if (session?.currentQuestionIndex !== undefined && session.currentQuestionIndex !== null) {
        setCurrentQuestionIndex(session.currentQuestionIndex);
      }
      // Initialize isPaused state from session status so button shows correct icon
      // Explicitly set both true/false to handle reconnection scenarios
      setIsPaused(session?.status === "paused");
      connectWebSocket();
      // Audio capture will be started when user clicks mic button (toggleListening)
    }
  }, [isResumedSession, isLoading, session?.currentQuestionIndex, session?.status, connectWebSocket]);

  // Lifecycle event logging for disconnect diagnostics
  // Logs browser events that commonly cause WebSocket disconnections
  useEffect(() => {
    const logLifecycleEvent = (eventName: string) => () => {
      console.log(`[Interview] Lifecycle: ${eventName}`, {
        visibilityState: document.visibilityState,
        onLine: navigator.onLine,
        hasFocus: document.hasFocus(),
        wsState: wsRef.current?.readyState,
        timestamp: Date.now(),
      });
    };

    const visibilityHandler = logLifecycleEvent("visibilitychange");
    const pagehideHandler = logLifecycleEvent("pagehide");
    const pageshowHandler = logLifecycleEvent("pageshow");
    const offlineHandler = logLifecycleEvent("offline");
    
    // Online handler: log the event AND trigger reconnection if disconnected
    const onlineHandler = () => {
      logLifecycleEvent("online")();
      // Auto-retry connection when coming back online
      // Use refs to avoid stale closure and prevent re-entrancy during active reconnect
      const wsState = wsRef.current?.readyState;
      const isDisconnected = !wsState || wsState === WebSocket.CLOSED || wsState === WebSocket.CLOSING;
      // Only start reconnect if: disconnected, not already reconnecting, no pending timer, and allowed
      const hasReconnectPending = reconnectTimeoutRef.current !== null;
      if (isDisconnected && !isReconnectingRef.current && !hasReconnectPending && 
          allowReconnectRef.current && !isUnmountingRef.current) {
        console.log("[Interview] Network restored, starting reconnection");
        startReconnect();
      } else if (isDisconnected && isReconnectingRef.current) {
        console.log("[Interview] Network restored during active reconnection, letting backoff continue");
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("pagehide", pagehideHandler);
    window.addEventListener("pageshow", pageshowHandler);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    // Page Lifecycle API events (freeze/resume) - use type assertion for browser compatibility
    const freezeHandler = logLifecycleEvent("freeze");
    const resumeHandler = logLifecycleEvent("resume");
    (document as EventTarget).addEventListener("freeze", freezeHandler);
    (document as EventTarget).addEventListener("resume", resumeHandler);

    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("pagehide", pagehideHandler);
      window.removeEventListener("pageshow", pageshowHandler);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      (document as EventTarget).removeEventListener("freeze", freezeHandler);
      (document as EventTarget).removeEventListener("resume", resumeHandler);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Mark as unmounting to prevent reconnection attempts
      isUnmountingRef.current = true;
      allowReconnectRef.current = false;
      clearReconnectTimer();
      
      stopAudioCapture();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      // Stop heartbeat interval on unmount
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [stopAudioCapture, clearReconnectTimer]);

  const toggleListening = async () => {
    if (isConnecting) return;

    if (!isConnected) {
      // Start interview
      connectWebSocket();
      if (!isTextOnlyMode) {
        const success = await startAudioCapture();
        if (success) {
          setIsListening(true);
        }
      }
      // In text-only mode, we don't start audio capture but still connect
    } else if (isPaused) {
      // Resume - send resume message to trigger AI continuation
      setIsPaused(false);
      if (!isTextOnlyMode) {
        setIsListening(true);
        await startAudioCapture();
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resume_interview" }));
      }
    } else if (isListening || (isTextOnlyMode && isConnected && (!isResumedSession || hasSentResumeRef.current))) {
      // Pause - send pause message
      // Note: For text-only resumed sessions, only enter pause branch if we've already started (hasSentResumeRef.current)
      setIsPaused(true);
      setIsListening(false);
      stopAudioCapture();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "pause_interview" }));
      }
    } else {
      // Resume listening (from stopped, not paused) - only in voice mode
      // This happens for resumed sessions when user clicks mic to start
      if (!isTextOnlyMode) {
        setIsListening(true);
        await startAudioCapture();
      }
      // For resumed sessions (voice or text-only), send resume_interview to trigger Alvia's welcome message
      if (isResumedSession && !hasSentResumeRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        hasSentResumeRef.current = true;
        console.log("[Interview] Sending resume_interview for resumed session");
        wsRef.current.send(JSON.stringify({ type: "resume_interview" }));
      }
    }
  };

  const handleNextQuestion = (skipConfirm = false) => {
    if (!skipConfirm && !highlightNextButton) {
      setConfirmDialog({ open: true, type: "next" });
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "next_question" }));
      setHighlightNextButton(false);
    }
  };

  const handleConfirmProceed = () => {
    setConfirmDialog({ open: false, type: confirmDialog.type });
    if (confirmDialog.type === "next") {
      handleNextQuestion(true);
    } else {
      handleEndInterviewConfirmed();
    }
  };

  const handleCancelProceed = () => {
    setConfirmDialog({ open: false, type: confirmDialog.type });
  };

  const handleSendText = () => {
    const text = textInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      return;

    // Clear input first to prevent duplicates from queued events
    setTextInput("");

    // Add to transcript with ordering check (insert before streaming AI response)
    setTranscript((prev) => {
      const newEntry = {
        speaker: "respondent" as const,
        text,
        timestamp: Date.now(),
      };

      // If the last entry is a streaming AI response, insert user text before it
      const lastEntry = prev[prev.length - 1];
      if (lastEntry && lastEntry.speaker === "alvia" && lastEntry.isStreaming) {
        return [...prev.slice(0, -1), newEntry, lastEntry];
      }

      return [...prev, newEntry];
    });

    // Send to server
    wsRef.current.send(
      JSON.stringify({
        type: "text_input",
        text,
      }),
    );
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleEndInterview = (skipConfirm = false) => {
    // Check if additional questions are enabled for this collection and feature flag
    const maxAQ = collection?.maxAdditionalQuestions ?? 1;
    const aqFeatureEnabled = interviewData?.features?.additionalQuestionsEnabled !== false;
    const isOnFinalQuestion = currentQuestionIndex >= (questions?.length ?? 1) - 1;
    
    // Only show AQ consent dialog when on the final question AND AQs are enabled
    if (!skipConfirm && isOnFinalQuestion && maxAQ > 0 && aqFeatureEnabled && !isInAQPhase) {
      setConfirmDialog({ open: true, type: "additional_questions" });
      return;
    } else if (!skipConfirm && !highlightNextButton) {
      setConfirmDialog({ open: true, type: "complete" });
      return;
    }
    handleEndInterviewConfirmed();
  };

  const handleAcceptAdditionalQuestions = () => {
    setConfirmDialog({ open: false, type: "complete" });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "request_additional_questions" }));
    }
  };

  const handleDeclineAdditionalQuestions = () => {
    setConfirmDialog({ open: false, type: "complete" });
    stopAudioCapture();
    setIsFinalizingInterview(true);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "decline_additional_questions" }));
      const timeoutId = setTimeout(() => {
        setIsFinalizingInterview(false);
        toast({
          title: "Interview completed",
          description: "Thank you for participating!",
        });
        navigate(`/review/${sessionId}`);
      }, 15000);
      (wsRef.current as any)._completeTimeoutId = timeoutId;
    } else {
      setIsFinalizingInterview(false);
      navigate(`/review/${sessionId}`);
    }
  };

  const handleNextAdditionalQuestion = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "next_additional_question" }));
    }
  };

  const handleEndAdditionalQuestions = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsCompletingAQ(true);
      wsRef.current.send(JSON.stringify({ type: "end_additional_questions" }));
    }
  };

  const handleEndInterviewConfirmed = () => {
    stopAudioCapture();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_interview" }));
      // Set a timeout fallback in case we don't receive "interview_complete" confirmation
      const timeoutId = setTimeout(() => {
        toast({
          title: "Interview completed",
          description: "Thank you for participating!",
        });
        navigate(`/review/${sessionId}`);
      }, 5000);
      // Store timeout ID to clear it if we receive the confirmation message
      (wsRef.current as any)._completeTimeoutId = timeoutId;
    } else {
      // WebSocket not open, navigate directly (session might already be completed)
      toast({
        title: "Interview completed",
        description: "Thank you for participating!",
      });
      navigate(`/review/${sessionId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl">
          <CardContent className="p-8 space-y-6">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle starting the interview from the ready screen
  const handleStartInterview = async () => {
    setReadyPhase(false);
    connectWebSocket();
    if (!isTextOnlyMode) {
      const success = await startAudioCapture();
      if (!success) {
        // Mic permission denied or failed - fall back to text mode
        setIsTextOnlyMode(true);
        toast({
          title: "Microphone unavailable",
          description: "You can type your responses instead.",
        });
      }
    }
  };

  // Show "Get Ready" screen before starting the interview
  if (readyPhase && !isResumedSession) {
    const greeting = respondent?.informalName 
      ? `Ok ${respondent.informalName}, Alvia's ready when you are`
      : "Alvia's ready when you are";
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 space-y-8 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Mic className="w-10 h-10 text-primary" />
            </div>
            
            <div className="space-y-3">
              <h1 className="text-2xl font-serif font-medium" data-testid="text-ready-greeting">
                {greeting}
              </h1>
              <p className="text-muted-foreground">
                Find somewhere quiet and comfortable. This should take about 10-15 minutes.
              </p>
            </div>

            <Button
              size="lg"
              className="w-full max-w-xs mx-auto"
              onClick={handleStartInterview}
              data-testid="button-start-interview"
            >
              Start Interview
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayQuestion =
    currentQuestionText ||
    currentQuestion?.questionText ||
    "Loading question...";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Mic className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">Alvia</span>
            {isConnected && (
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-600 border-green-200"
              >
                Connected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isInAQPhase ? (
              <Badge variant="secondary" className="gap-1">
                <MessageSquareText className="w-3 h-3" />
                Follow-up {currentAQIndex + 1} of {aqQuestions.length}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                Question {currentQuestionIndex + 1} of{" "}
                {totalQuestions || questions?.length || 0}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEndInterview()}
              data-testid="button-end-interview"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <Progress value={progress} className="h-1" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-3xl space-y-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-4"
            >
              <p
                className="text-2xl font-serif leading-relaxed"
                data-testid="text-current-question"
              >
                {displayQuestion}
              </p>
              {currentQuestion?.questionType !== "open" && currentQuestion && (
                <Badge variant="secondary">
                  {currentQuestion.questionType === "yes_no" &&
                    "Yes/No question"}
                  {currentQuestion.questionType === "scale" &&
                    `Rate from ${currentQuestion.scaleMin || 1} to ${currentQuestion.scaleMax || 10}`}
                  {currentQuestion.questionType === "numeric" &&
                    "Provide a number"}
                  {currentQuestion.questionType === "multi_select" &&
                    "Select multiple options"}
                </Badge>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col items-center gap-6">
            <WaveformVisualizer
              isActive={isListening && !silencePauseActive && !isSilent}
              isAiSpeaking={isAiSpeaking}
            />

            <AnimatePresence>
              {silencePauseActive && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 text-muted-foreground text-sm"
                  data-testid="status-silence-pause"
                >
                  <Clock className="w-4 h-4" />
                  <span>Waiting for you to speak...</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-4">
              <div className="w-16 flex justify-center">
                <Button
                  variant={isTextOnlyMode ? "default" : "outline"}
                  size="icon"
                  onClick={() => {
                    if (isConnected && !isPaused) {
                      if (!isTextOnlyMode && isListening) {
                        stopAudioCapture();
                        setIsListening(false);
                      }
                      if (isTextOnlyMode) {
                        setIsPaused(true);
                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                          wsRef.current.send(JSON.stringify({ type: "pause_interview" }));
                        }
                      }
                    }
                    setIsTextOnlyMode(!isTextOnlyMode);
                  }}
                  disabled={isConnecting}
                  title={
                    isTextOnlyMode
                      ? "Switch to voice input"
                      : "Switch to text-only input (for noisy environments)"
                  }
                  data-testid="button-text-mode-toggle"
                >
                  {isTextOnlyMode ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <MessageSquareText className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <MicButton
                signals={{
                  isListening,
                  isAiSpeaking,
                  isPaused,
                  isConnecting,
                  isConnected,
                  isTextOnlyMode,
                  silencePauseActive,
                  isReconnecting,
                  showQualitySwitchPrompt,
                  aqGenerating,
                  isFinalizingInterview,
                  isCompletingAQ,
                  readyPhase,
                }}
                onToggle={toggleListening}
              />

              {showVadIndicator && isConnected ? (
                <div
                  className={`w-16 h-9 flex items-center justify-center rounded-md text-xs font-mono ${
                    vadEagerness === "low"
                      ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                      : vadEagerness === "high"
                      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                  title={`VAD eagerness: ${vadEagerness}`}
                  data-testid="indicator-vad-eagerness"
                >
                  VAD:{vadEagerness}
                </div>
              ) : (
                <div className="w-16" />
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {isReconnecting
                ? `Reconnecting... (Attempt ${reconnectAttempt} of ${RECONNECT_MAX_ATTEMPTS})`
                : isConnecting
                  ? "Connecting to Alvia..."
                  : isAiSpeaking
                    ? "Alvia is speaking..."
                    : isPaused
                      ? "Interview paused. Click to resume."
                      : isTextOnlyMode
                        ? isConnected
                          ? "Text-only mode - type your responses below"
                          : "Click to start the interview in text-only mode"
                        : isListening
                          ? "Listening... speak naturally"
                          : "Click the microphone to start the interview"}
            </p>
          </div>

          <TranscriptPanel entries={transcript} />

          {/* Transcription quality warning - appears when noisy environment detected */}
          <AnimatePresence>
            {showQualitySwitchPrompt && !isTextOnlyMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          {transcriptionQualityWarning || "Having trouble hearing clearly."}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (isListening) {
                              toggleListening();
                            }
                            setIsTextOnlyMode(true);
                            setShowQualitySwitchPrompt(false);
                          }}
                          className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                          data-testid="button-switch-to-text"
                        >
                          <Keyboard className="w-4 h-4" />
                          Switch to text
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowQualitySwitchPrompt(false)}
                          className="text-amber-600 dark:text-amber-400"
                          data-testid="button-dismiss-quality-warning"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat input for keyboard users */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder={
                  isConnected
                    ? "Type your response here..."
                    : "Connect to start typing..."
                }
                disabled={!isConnected}
                className="pl-10 pr-12"
                data-testid="input-chat-text"
              />
            </div>
            <Button
              onClick={handleSendText}
              disabled={!isConnected || !textInput.trim()}
              size="icon"
              data-testid="button-send-text"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex justify-center gap-4">
            {isInAQPhase ? (
              // AQ Phase buttons
              <>
                {currentAQIndex < aqQuestions.length - 1 ? (
                  <Button
                    onClick={handleNextAdditionalQuestion}
                    disabled={!isConnected}
                    data-testid="button-next-aq"
                  >
                    Next Follow-up
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleEndAdditionalQuestions}
                    data-testid="button-complete-aq"
                  >
                    Complete Interview
                    <CheckCircle2 className="w-4 h-4 ml-2" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleEndAdditionalQuestions}
                  data-testid="button-skip-aq"
                >
                  Skip Remaining
                </Button>
              </>
            ) : (totalQuestions > 0 || questions) &&
            currentQuestionIndex <
              (totalQuestions || questions?.length || 0) - 1 ? (
              <Button
                onClick={() => handleNextQuestion()}
                disabled={!isConnected}
                data-testid="button-next-question"
                className={
                  highlightNextButton
                    ? "animate-pulse ring-4 ring-primary ring-offset-4 ring-offset-background shadow-xl shadow-primary/70 scale-105 transition-transform"
                    : ""
                }
              >
                Next Question
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => handleEndInterview()}
                data-testid="button-complete-interview"
                className={
                  highlightNextButton
                    ? "animate-pulse ring-4 ring-primary ring-offset-4 ring-offset-background shadow-xl shadow-primary/70 scale-105 transition-transform"
                    : ""
                }
              >
                Complete Interview
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {confirmDialog.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={handleCancelProceed}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="w-full max-w-md">
                <CardContent className="pt-6 space-y-4">
                  {confirmDialog.type === "additional_questions" ? (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                          <MessageSquareText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-semibold text-lg">
                            One More Thing...
                          </h3>
                          <p className="text-muted-foreground text-sm">
                            Based on your responses, we may have a few follow-up questions to explore some topics in more depth. Would you like to answer them? This is entirely optional.
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={handleDeclineAdditionalQuestions}
                          data-testid="button-decline-aq"
                        >
                          No, Complete Now
                        </Button>
                        <Button
                          onClick={handleAcceptAdditionalQuestions}
                          data-testid="button-accept-aq"
                        >
                          Yes, Continue
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-semibold text-lg">
                            {confirmDialog.type === "next"
                              ? "Move to Next Question?"
                              : "Complete Interview?"}
                          </h3>
                          <p className="text-muted-foreground text-sm">
                            {confirmDialog.type === "next"
                              ? "Are you sure you've fully explored this question?"
                              : "Are you sure you're ready to finish?"}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={handleCancelProceed}
                          data-testid="button-cancel-proceed"
                        >
                          Stay Here
                        </Button>
                        <Button
                          onClick={handleConfirmProceed}
                          data-testid="button-confirm-proceed"
                        >
                          {confirmDialog.type === "next"
                            ? "Yes, Next Question"
                            : "Yes, Complete"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AQ Generating Overlay */}
      <AnimatePresence>
        {aqGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <Card className="w-full max-w-md">
                <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
                  {aqMessage?.includes("comprehensive") || aqMessage?.includes("no additional") ? (
                    <>
                      <CheckCircle2 className="w-12 h-12 text-green-500" />
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold text-lg">Interview Complete</h3>
                        <p className="text-muted-foreground text-sm">
                          {aqMessage}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold text-lg">Preparing Questions</h3>
                        <p className="text-muted-foreground text-sm">
                          {aqMessage || "Our AI analyst is reviewing your interview..."}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interview Finalizing Overlay (shown when declining AQs) */}
      <AnimatePresence>
        {isFinalizingInterview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            data-testid="overlay-finalizing-interview"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <Card className="w-full max-w-md">
                <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold text-lg" data-testid="text-finalizing-title">Wrapping Up</h3>
                    <p className="text-muted-foreground text-sm" data-testid="text-finalizing-message">
                      Barbara is finishing up her notes...
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AQ Completing Overlay */}
      <AnimatePresence>
        {isCompletingAQ && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <Card className="w-full max-w-md">
                <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold text-lg">Wrapping Up</h3>
                    <p className="text-muted-foreground text-sm">
                      Barbara is finishing up her notes...
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
