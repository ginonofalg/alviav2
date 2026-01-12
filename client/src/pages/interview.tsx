import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Mic, 
  MicOff, 
  Pause, 
  Play, 
  SkipForward,
  X,
  Volume2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

function WaveformVisualizer({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {[...Array(24)].map((_, i) => (
        <motion.div
          key={i}
          className={`w-1 rounded-full ${isActive ? "bg-primary" : "bg-muted"}`}
          animate={isActive ? {
            height: [8, Math.random() * 48 + 8, 8],
          } : { height: 8 }}
          transition={{
            duration: 0.6,
            repeat: isActive ? Infinity : 0,
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
  onToggle 
}: { 
  isListening: boolean;
  isPaused: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      onClick={onToggle}
      className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
        isListening 
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
      {isPaused ? (
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
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const { data: interviewData, isLoading } = useQuery<InterviewData>({
    queryKey: ["/api/interview", sessionId],
    enabled: !!sessionId,
  });

  const session = interviewData?.session;
  const questions = interviewData?.questions;
  const currentQuestion = questions?.[currentQuestionIndex];
  const progress = questions ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

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

  const toggleListening = () => {
    if (isPaused) {
      setIsPaused(false);
      setIsListening(true);
    } else if (isListening) {
      setIsPaused(true);
      setIsListening(false);
    } else {
      setIsListening(true);
    }
  };

  const handleNextQuestion = () => {
    if (questions && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTranscript([]);
    }
  };

  const handleEndInterview = () => {
    setIsListening(false);
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Mic className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">Alvia</span>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="gap-1">
              Question {currentQuestionIndex + 1} of {questions?.length || 0}
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
                {currentQuestion?.questionText || "Loading question..."}
              </p>
              {currentQuestion?.questionType !== "open" && (
                <Badge variant="secondary">
                  {currentQuestion?.questionType === "yes_no" && "Yes/No question"}
                  {currentQuestion?.questionType === "scale" && `Rate from ${currentQuestion.scaleMin || 1} to ${currentQuestion.scaleMax || 10}`}
                  {currentQuestion?.questionType === "numeric" && "Provide a number"}
                  {currentQuestion?.questionType === "multi_select" && "Select multiple options"}
                </Badge>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col items-center gap-6">
            <WaveformVisualizer isActive={isListening} />
            
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsPaused(!isPaused)}
                disabled={!isListening && !isPaused}
                data-testid="button-pause"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>

              <MicButton
                isListening={isListening}
                isPaused={isPaused}
                onToggle={toggleListening}
              />

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextQuestion}
                disabled={!questions || currentQuestionIndex >= questions.length - 1}
                data-testid="button-skip"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {isPaused 
                ? "Interview paused. Click to resume." 
                : isListening 
                ? "Listening... speak naturally" 
                : "Click the microphone to start speaking"}
            </p>
          </div>

          <TranscriptPanel entries={transcript} />

          <div className="flex justify-center gap-4">
            {questions && currentQuestionIndex < questions.length - 1 ? (
              <Button onClick={handleNextQuestion} data-testid="button-next-question">
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
