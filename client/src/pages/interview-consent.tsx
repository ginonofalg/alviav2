import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic, Shield, FileText, Volume2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Collection, Project } from "@shared/schema";

export default function InterviewConsentPage() {
  const params = useParams<{ collectionId: string }>();
  const collectionId = params.collectionId;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [consents, setConsents] = useState({
    participation: false,
    audioRecording: false,
    dataProcessing: false,
  });

  const { data: collection, isLoading: collectionLoading } = useQuery<Collection & { project?: Project }>({
    queryKey: ["/api/collections", collectionId],
    enabled: !!collectionId,
  });

  const startSession = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/collections/${collectionId}/sessions`, {
        consents,
      });
      return response;
    },
    onSuccess: (data) => {
      navigate(`/interview/${data.id}`);
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

  const canProceed = allConsentsGiven && (!requiresAudioConsent || consents.audioRecording);

  if (collectionLoading) {
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Mic className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-serif">Welcome to Your Interview</CardTitle>
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
                <span>You'll have a voice conversation with Alvia, our AI interviewer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">2.</span>
                <span>Speak naturally - there are no right or wrong answers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">3.</span>
                <span>You can pause or stop at any time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">4.</span>
                <span>The interview typically takes 10-15 minutes</span>
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
                    setConsents(prev => ({ ...prev, participation: checked === true }))
                  }
                  data-testid="checkbox-participation"
                />
                <div className="space-y-1">
                  <Label htmlFor="participation" className="font-medium cursor-pointer">
                    I agree to participate in this interview *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    I understand that my responses will be recorded and analyzed.
                  </p>
                </div>
              </div>

              {requiresAudioConsent && (
                <div className="flex items-start gap-3 p-3 rounded-lg border">
                  <Checkbox
                    id="audioRecording"
                    checked={consents.audioRecording}
                    onCheckedChange={(checked) => 
                      setConsents(prev => ({ ...prev, audioRecording: checked === true }))
                    }
                    data-testid="checkbox-audio"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="audioRecording" className="font-medium cursor-pointer">
                      I consent to audio recording *
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Audio will be recorded for transcription and quality purposes.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Checkbox
                  id="dataProcessing"
                  checked={consents.dataProcessing}
                  onCheckedChange={(checked) => 
                    setConsents(prev => ({ ...prev, dataProcessing: checked === true }))
                  }
                  data-testid="checkbox-data"
                />
                <div className="space-y-1">
                  <Label htmlFor="dataProcessing" className="font-medium cursor-pointer">
                    I agree to data processing *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    My responses may be summarized and analyzed. Personal information will be protected.
                    {project?.piiRedactionEnabled && " PII will be automatically redacted."}
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
