import { useState, useEffect, useRef, useCallback } from "react";
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
  SkipForward,
  X,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Keyboard
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { InterviewSession, Question, Collection, InterviewTemplate } from "@shared/schema";

interface InterviewData {
  session: InterviewSession;
  collection: Collection;
  template: InterviewTemplate;
  questions: Question[];
}

interface TranscriptEntry {
  speaker: "alvia" | "respondent";
  text: string;
  timestamp: number;
}

function WaveformVisualizer({ isActive, isAiSpeaking }: { isActive: boolean; isAiSpeaking?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {[...Array(24)].map((_, i) => (
        <motion.div
          key={i}
          className={`w-1 rounded-full ${
            isAiSpeaking ? "bg-green-500" : isActive ? "bg-primary" : "bg-muted"
          }`}
          animate={isActive || isAiSpeaking ? {
            height: [8, Math.random() * 48 + 8, 8],
          } : { height: 8 }}
          transition={{
            duration: 0.6,
            repeat: (isActive || isAiSpeaking) ? Infinity : 0,
            delay: i * 0.03,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function MicButton({ 
  isListening, 
  isPaused,
  isConnecting,
  onToggle 
}: { 
  isListening: boolean;
  isPaused: boolean;
  isConnecting: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      onClick={onToggle}
      disabled={isConnecting}
      className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
        isConnecting
          ? "bg-muted text-muted-foreground cursor-wait"
          : isListening 
          ? "bg-primary text-primary-foreground" 
          : isPaused
          ? "bg-yellow-500 text-white"
          : "bg-muted text-muted-foreground"
      }`}
      whileTap={{ scale: 0.95 }}
      data-testid="button-mic-toggle"
    >
      {isListening && (
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-primary"
          animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {isConnecting ? (
        <Loader2 className="w-8 h-8 animate-spin" />
      ) : isPaused ? (
        <Play className="w-8 h-8" />
      ) : isListening ? (
        <Mic className="w-8 h-8" />
      ) : (
        <MicOff className="w-8 h-8" />
      )}
    </motion.button>
  );
}

function TranscriptPanel({ entries }: { entries: TranscriptEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <ScrollArea className="h-64 rounded-lg border bg-card p-4" ref={scrollRef}>
      {entries.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Transcript will appear here as you speak...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, index) => (
            <div
              key={index}
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
                }`}
              >
                <p className="text-sm leading-relaxed">{entry.text}</p>
                <span className="text-xs opacity-70 mt-1 block">
                  {new Date(entry.timestamp).toLocaleTimeString([], { 
                    hour: "2-digit", 
                    minute: "2-digit" 
                  })}
                </span>
              </div>
            </div>
          ))}
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
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestionText, setCurrentQuestionText] = useState<string>("");
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [aiTranscriptBuffer, setAiTranscriptBuffer] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isSendingText, setIsSendingText] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const { data: interviewData, isLoading } = useQuery<InterviewData>({
    queryKey: ["/api/interview", sessionId],
    enabled: !!sessionId,
  });

  const session = interviewData?.session;
  const questions = interviewData?.questions;
  const currentQuestion = questions?.[currentQuestionIndex];
  const progress = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    return audioContextRef.current;
  }, []);

  // Play audio from base64 PCM16 data
  const playAudio = useCallback((base64Audio: string) => {
    try {
      const audioContext = initAudioContext();
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Convert PCM16 to Float32
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      audioQueueRef.current.push(float32Array);
      
      if (!isPlayingRef.current) {
        playNextChunk(audioContext);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
    }
  }, [initAudioContext]);

  const playNextChunk = useCallback((audioContext: AudioContext) => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
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
    source.start();
  }, []);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (!sessionId || wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/interview?sessionId=${sessionId}`;
    
    console.log("[Interview] Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Interview] WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("[Interview] Error parsing message:", error);
      }
    };

    ws.onclose = () => {
      console.log("[Interview] WebSocket closed");
      setIsConnected(false);
      setIsConnecting(false);
      setIsListening(false);
    };

    ws.onerror = (error) => {
      console.error("[Interview] WebSocket error:", error);
      setIsConnecting(false);
      toast({
        title: "Connection error",
        description: "Failed to connect to voice service. Please try again.",
        variant: "destructive",
      });
    };
  }, [sessionId, toast]);

  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case "connected":
        console.log("[Interview] Session connected:", message);
        setIsConnected(true);
        setIsConnecting(false);
        setIsListening(true);
        setCurrentQuestionIndex(message.questionIndex || 0);
        setTotalQuestions(message.totalQuestions || 0);
        if (message.currentQuestion) {
          setCurrentQuestionText(message.currentQuestion);
        }
        break;

      case "audio":
        playAudio(message.delta);
        break;

      case "audio_done":
        // Audio stream complete for this response
        break;

      case "ai_transcript":
        setAiTranscriptBuffer(prev => prev + message.delta);
        break;

      case "ai_transcript_done":
        // Add complete AI transcript to entries
        if (message.transcript) {
          setTranscript(prev => [...prev, {
            speaker: "alvia",
            text: message.transcript,
            timestamp: Date.now(),
          }]);
        }
        setAiTranscriptBuffer("");
        break;

      case "user_transcript":
        // Add user transcript to entries
        if (message.transcript) {
          setTranscript(prev => [...prev, {
            speaker: "respondent",
            text: message.transcript,
            timestamp: Date.now(),
          }]);
        }
        break;

      case "user_speaking_started":
        setIsAiSpeaking(false);
        break;

      case "user_speaking_stopped":
        break;

      case "question_changed":
        setCurrentQuestionIndex(message.questionIndex);
        if (message.currentQuestion) {
          setCurrentQuestionText(message.currentQuestion);
        }
        break;

      case "interview_complete":
        toast({
          title: "Interview completed",
          description: "Thank you for participating!",
        });
        navigate("/interview/complete");
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
    }
  }, [playAudio, toast, navigate]);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    try {
      const audioContext = initAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      mediaStreamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (isAiSpeaking) return; // Don't send audio while AI is speaking

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32 to Int16
        const int16Array = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const uint8Array = new Uint8Array(int16Array.buffer);
        let binary = "";
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Audio = btoa(binary);
        
        // Send to server
        wsRef.current.send(JSON.stringify({
          type: "audio",
          audio: base64Audio,
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      
      return true;
    } catch (error) {
      console.error("[Interview] Error starting audio capture:", error);
      return false;
    }
  }, [initAudioContext, isAiSpeaking]);

  // Stop audio capture
  const stopAudioCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const requestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
    } catch (error) {
      setHasPermission(false);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to participate in the interview.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    requestMicPermission();
  }, [requestMicPermission]);

  // Initialize question text from query data
  useEffect(() => {
    if (currentQuestion && !currentQuestionText) {
      setCurrentQuestionText(currentQuestion.questionText);
    }
    if (questions && totalQuestions === 0) {
      setTotalQuestions(questions.length);
    }
  }, [currentQuestion, questions, currentQuestionText, totalQuestions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioCapture();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopAudioCapture]);

  const toggleListening = async () => {
    if (isConnecting) return;

    if (!isConnected) {
      // Start interview
      connectWebSocket();
      const success = await startAudioCapture();
      if (success) {
        setIsListening(true);
      }
    } else if (isPaused) {
      // Resume
      setIsPaused(false);
      setIsListening(true);
      await startAudioCapture();
    } else if (isListening) {
      // Pause
      setIsPaused(true);
      setIsListening(false);
      stopAudioCapture();
    } else {
      // Resume listening
      setIsListening(true);
      await startAudioCapture();
    }
  };

  const handleNextQuestion = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "next_question" }));
    }
  };

  const handleSendText = () => {
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    setIsSendingText(true);
    
    // Add to transcript immediately
    setTranscript(prev => [...prev, {
      speaker: "respondent",
      text: textInput.trim(),
      timestamp: Date.now(),
    }]);
    
    // Send to server
    wsRef.current.send(JSON.stringify({
      type: "text_input",
      text: textInput.trim(),
    }));
    
    setTextInput("");
    setIsSendingText(false);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleEndInterview = () => {
    stopAudioCapture();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_interview" }));
    }
    wsRef.current?.close();
    toast({
      title: "Interview completed",
      description: "Thank you for participating!",
    });
    navigate("/interview/complete");
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

  if (hasPermission === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-6">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Microphone Access Required</h2>
            <p className="text-muted-foreground">
              This interview requires microphone access to capture your responses.
              Please enable microphone permissions and refresh the page.
            </p>
            <Button onClick={requestMicPermission} data-testid="button-retry-permission">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayQuestion = currentQuestionText || currentQuestion?.questionText || "Loading question...";

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
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                Connected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="gap-1">
              Question {currentQuestionIndex + 1} of {totalQuestions || questions?.length || 0}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEndInterview}
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
              <p className="text-2xl font-serif leading-relaxed" data-testid="text-current-question">
                {displayQuestion}
              </p>
              {currentQuestion?.questionType !== "open" && currentQuestion && (
                <Badge variant="secondary">
                  {currentQuestion.questionType === "yes_no" && "Yes/No question"}
                  {currentQuestion.questionType === "scale" && `Rate from ${currentQuestion.scaleMin || 1} to ${currentQuestion.scaleMax || 10}`}
                  {currentQuestion.questionType === "numeric" && "Provide a number"}
                  {currentQuestion.questionType === "multi_select" && "Select multiple options"}
                </Badge>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col items-center gap-6">
            <WaveformVisualizer isActive={isListening} isAiSpeaking={isAiSpeaking} />
            
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (isPaused) {
                    setIsPaused(false);
                    setIsListening(true);
                    startAudioCapture();
                  } else {
                    setIsPaused(true);
                    setIsListening(false);
                    stopAudioCapture();
                  }
                }}
                disabled={!isConnected}
                data-testid="button-pause"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>

              <MicButton
                isListening={isListening}
                isPaused={isPaused}
                isConnecting={isConnecting}
                onToggle={toggleListening}
              />

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextQuestion}
                disabled={!isConnected || currentQuestionIndex >= (totalQuestions || questions?.length || 0) - 1}
                data-testid="button-skip"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {isConnecting 
                ? "Connecting to Alvia..."
                : isAiSpeaking
                ? "Alvia is speaking..."
                : isPaused 
                ? "Interview paused. Click to resume." 
                : isListening 
                ? "Listening... speak naturally" 
                : "Click the microphone to start the interview"}
            </p>
          </div>

          {/* Show streaming AI transcript */}
          {aiTranscriptBuffer && (
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground italic">{aiTranscriptBuffer}</p>
            </div>
          )}

          <TranscriptPanel entries={transcript} />

          {/* Chat input for keyboard users */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder={isConnected ? "Type your response here..." : "Connect to start typing..."}
                disabled={!isConnected || isSendingText}
                className="pl-10 pr-12"
                data-testid="input-chat-text"
              />
            </div>
            <Button
              onClick={handleSendText}
              disabled={!isConnected || !textInput.trim() || isSendingText}
              size="icon"
              data-testid="button-send-text"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex justify-center gap-4">
            {(totalQuestions > 0 || questions) && currentQuestionIndex < (totalQuestions || questions?.length || 0) - 1 ? (
              <Button onClick={handleNextQuestion} disabled={!isConnected} data-testid="button-next-question">
                Next Question
                <SkipForward className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleEndInterview} data-testid="button-complete-interview">
                Complete Interview
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
