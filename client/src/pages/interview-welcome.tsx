import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic, ArrowRight, User, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InterviewSession } from "@shared/schema";

export default function InterviewWelcomePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [informalName, setInformalName] = useState("");

  const { data: session, isLoading } = useQuery<InterviewSession & { respondentId: string }>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const updateNames = useMutation({
    mutationFn: async () => {
      if (!session?.respondentId) throw new Error("Session not found");
      
      await apiRequest("PATCH", `/api/respondents/${session.respondentId}/names`, {
        fullName: fullName.trim() || null,
        informalName: informalName.trim() || null,
      });
    },
    onSuccess: () => {
      navigate(`/interview/${sessionId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleContinue = () => {
    updateNames.mutate();
  };

  const handleSkip = () => {
    navigate(`/interview/${sessionId}`);
  };

  if (isLoading) {
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

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-6">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Session Not Found</h2>
            <p className="text-muted-foreground">
              This interview session could not be found. Please try starting again.
            </p>
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
              Before we begin, let's get to know you a little better
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Your full name
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="fullName"
                placeholder="e.g., Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                data-testid="input-full-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="informalName" className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                What should Alvia call you?
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="informalName"
                placeholder="e.g., Jane, J, or a nickname"
                value={informalName}
                onChange={(e) => setInformalName(e.target.value)}
                data-testid="input-informal-name"
              />
              <p className="text-sm text-muted-foreground">
                This is how Alvia will address you during the conversation
              </p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Privacy Notice</p>
                <p className="mt-1">
                  Any names you provide may appear in interview transcripts. If you prefer to remain 
                  anonymous, simply leave these fields blank and continue.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full"
              size="lg"
              onClick={handleContinue}
              disabled={updateNames.isPending}
              data-testid="button-continue"
            >
              {updateNames.isPending ? "Saving..." : "Continue to Interview"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            
            {!fullName && !informalName && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleSkip}
                data-testid="button-skip"
              >
                Skip and remain anonymous
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            You can start the interview without providing any personal information
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
