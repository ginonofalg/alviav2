import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";

export default function InterviewResumePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateAndRedirect() {
      if (!token) {
        setError("No resume token provided");
        return;
      }

      try {
        const response = await fetch(`/api/interview/resume/${token}`);
        
        if (!response.ok) {
          const data = await response.json();
          setError(data.message || "Invalid or expired resume link");
          return;
        }

        const data = await response.json();
        
        // API returns session object, not sessionId directly
        const sessionId = data.session?.id || data.sessionId;
        if (sessionId) {
          setLocation(`/interview/${sessionId}?resume=true`);
        } else {
          setError("Could not find session to resume");
        }
      } catch (err) {
        setError("Failed to validate resume link");
      }
    }

    validateAndRedirect();
  }, [token, setLocation]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-semibold">Unable to Resume Interview</h1>
              <p className="text-muted-foreground">{error}</p>
              <p className="text-sm text-muted-foreground">
                Please contact the researcher for a new link if needed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h1 className="text-xl font-semibold">Resuming Your Interview</h1>
            <p className="text-muted-foreground">Please wait while we prepare your session...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
