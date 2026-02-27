import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Shield,
  FileText,
  Volume2,
  ArrowRight,
  RotateCcw,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Collection, Project, InterviewSession } from "@shared/schema";

interface ResumeData {
  session: InterviewSession;
  isResume: boolean;
}

interface InvitationData {
  respondent: {
    id: string;
    fullName?: string;
    informalName?: string;
    email?: string;
  };
  collection: {
    id: string;
    name: string;
    isActive: boolean;
  };
  template?: {
    id: string;
    name: string;
  };
}

export default function InterviewConsentPage() {
  const params = useParams<{ collectionId: string }>();
  const collectionId = params.collectionId;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Parse invitation token from URL query params
  const invitationToken = useMemo(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("t");
    }
    return null;
  }, []);

  const [consents, setConsents] = useState({
    participation: false,
    audioRecording: false,
    dataProcessing: false,
  });
  const [resumeInfo, setResumeInfo] = useState<{
    sessionId: string;
    token: string;
  } | null>(null);
  const [checkingResume, setCheckingResume] = useState(true);

  // Check for existing resume token on mount
  useEffect(() => {
    async function checkForResume() {
      if (!collectionId) {
        setCheckingResume(false);
        return;
      }

      const stored = localStorage.getItem(`alvia_resume_${collectionId}`);
      if (!stored) {
        setCheckingResume(false);
        return;
      }

      try {
        const { token, sessionId } = JSON.parse(stored);
        const response = await fetch(`/api/interview/resume/${token}`);

        if (response.ok) {
          const data: ResumeData = await response.json();
          if (
            data.isResume &&
            ["paused", "in_progress", "consent_given"].includes(
              data.session.status,
            )
          ) {
            setResumeInfo({ sessionId, token });
          }
        } else {
          // Token invalid or expired, clear it
          localStorage.removeItem(`alvia_resume_${collectionId}`);
        }
      } catch (error) {
        console.error("Error checking resume token:", error);
        localStorage.removeItem(`alvia_resume_${collectionId}`);
      }

      setCheckingResume(false);
    }

    checkForResume();
  }, [collectionId]);

  const { data: collection, isLoading: collectionLoading } = useQuery<
    Collection & { project?: Project }
  >({
    queryKey: ["/api/collections", collectionId],
    enabled: !!collectionId,
  });

  // Fetch invitation data if token is present
  const { data: invitationData, isLoading: invitationLoading } =
    useQuery<InvitationData>({
      queryKey: ["/api/invitation", invitationToken],
      enabled: !!invitationToken,
    });

  const startSession = useMutation({
    mutationFn: async () => {
      // Use token-based endpoint if we have an invitation token
      if (invitationToken) {
        const response = await apiRequest(
          "POST",
          `/api/collections/${collectionId}/start-by-token`,
          {
            token: invitationToken,
          },
        );
        return response.json();
      }

      // Otherwise use the standard session creation
      const response = await apiRequest(
        "POST",
        `/api/collections/${collectionId}/sessions`,
        {
          consents,
        },
      );
      return response.json();
    },
    onSuccess: async (data) => {
      // Store resume token in localStorage for browser recovery
      if (data.resumeToken) {
        localStorage.setItem(
          `alvia_resume_${collectionId}`,
          JSON.stringify({
            token: data.resumeToken,
            sessionId: data.id,
            createdAt: Date.now(),
          }),
        );
      }

      // Request microphone permission early (don't block on failure - text mode is available)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        // Permission denied - user can still use text mode in the interview
        console.log(
          "[Consent] Microphone permission not granted, text mode available",
        );
      }

      // Navigate to welcome page for name capture before interview
      navigate(`/welcome/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start interview",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const allConsentsGiven = consents.participation && consents.dataProcessing;
  const project = collection?.project;
  const requiresAudioConsent = project?.consentAudioRecording !== false;

  const canProceed =
    allConsentsGiven && (!requiresAudioConsent || consents.audioRecording);

  const handleResume = () => {
    if (resumeInfo) {
      navigate(`/interview/${resumeInfo.sessionId}`);
    }
  };

  const handleStartFresh = () => {
    if (collectionId) {
      localStorage.removeItem(`alvia_resume_${collectionId}`);
    }
    setResumeInfo(null);
  };

  // Personalized greeting for invited respondents
  const respondentName =
    invitationData?.respondent?.fullName ||
    invitationData?.respondent?.informalName;

  if (
    collectionLoading ||
    checkingResume ||
    (invitationToken && invitationLoading)
  ) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 space-y-6">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show resume option if there's an existing session
  if (resumeInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center space-y-4 pb-2">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <RotateCcw className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-serif">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-base mt-2">
                You have an interview in progress
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">
                It looks like you were in the middle of an interview. Would you
                like to continue where you left off?
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleResume}
                size="lg"
                className="w-full"
                data-testid="button-resume-interview"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Resume Interview
              </Button>
              <Button
                onClick={handleStartFresh}
                variant="outline"
                size="lg"
                className="w-full"
                data-testid="button-start-fresh"
              >
                Start a New Interview
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            {respondentName ? (
              <User className="w-8 h-8 text-primary" />
            ) : (
              <Bot className="w-8 h-8 text-primary" />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-serif">
              {respondentName
                ? `Welcome, ${respondentName}`
                : "Welcome to Your Interview"}
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {collection?.name || "Interview Session"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary" />
              How it works
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">1.</span>
                <span>
                  You'll have a voice conversation with Alvia, our AI
                  interviewer.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">2.</span>
                <span>
                  There are a number of set questions which Alvia will explore
                  with follow-up questions; you decide when to move to the next
                  one.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">3.</span>
                <span>
                  Make sure you've got a good Internet connection. Find a quiet
                  location and use a headset or earphones if you have them.
                  Speak naturally. Alvia may take a moment to respond at first.
                  Be patient, she'll adapt.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">4.</span>
                <span>
                  You can pause at any time. You can type your answers if you
                  prefer.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">5.</span>
                <span>The interview typically takes 10-15 minutes.</span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Consent
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Checkbox
                  id="participation"
                  checked={consents.participation}
                  onCheckedChange={(checked) =>
                    setConsents((prev) => ({
                      ...prev,
                      participation: checked === true,
                    }))
                  }
                  data-testid="checkbox-participation"
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="participation"
                    className="font-medium cursor-pointer"
                  >
                    I agree to participate in the interview *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    I understand that my responses will be recorded and
                    analysed.
                  </p>
                </div>
              </div>

              {requiresAudioConsent && (
                <div className="flex items-start gap-3 p-3 rounded-lg border">
                  <Checkbox
                    id="audioRecording"
                    checked={consents.audioRecording}
                    onCheckedChange={(checked) =>
                      setConsents((prev) => ({
                        ...prev,
                        audioRecording: checked === true,
                      }))
                    }
                    data-testid="checkbox-audio"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="audioRecording"
                      className="font-medium cursor-pointer"
                    >
                      I consent to audio recording *
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Audio will be recorded for transcription and quality
                      purposes.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Checkbox
                  id="dataProcessing"
                  checked={consents.dataProcessing}
                  onCheckedChange={(checked) =>
                    setConsents((prev) => ({
                      ...prev,
                      dataProcessing: checked === true,
                    }))
                  }
                  data-testid="checkbox-data"
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="dataProcessing"
                    className="font-medium cursor-pointer"
                  >
                    I agree to data processing *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    My responses may be summarized and analysed. Personal
                    information will be protected.
                    {project?.piiRedactionEnabled &&
                      " PII will be automatically redacted."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button
              className="w-full"
              size="lg"
              disabled={!canProceed || startSession.isPending}
              onClick={() => startSession.mutate()}
              data-testid="button-start-interview"
            >
              {startSession.isPending ? "Starting..." : "Begin Interview"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              By proceeding, you agree to our terms and privacy policy.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
