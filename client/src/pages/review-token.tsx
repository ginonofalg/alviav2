import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const REVIEW_TOKEN_KEY = "review_access_token";

export default function ReviewTokenPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError("No token provided");
        setIsLoading(false);
        return;
      }

      try {
        const response = await apiRequest("GET", `/api/review/${token}`);
        if (!response.ok) {
          const data = await response.json();
          if (response.status === 410) {
            setError("This review link has expired. Review links are valid for 48 hours.");
          } else {
            setError(data.message || "Invalid review link");
          }
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        
        // Store token in sessionStorage for API calls
        sessionStorage.setItem(`${REVIEW_TOKEN_KEY}_${data.sessionId}`, token);
        
        navigate(`/review/${data.sessionId}`, { replace: true });
      } catch (err) {
        setError("Failed to validate review link");
        setIsLoading(false);
      }
    }

    validateToken();
  }, [token, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <Skeleton className="w-16 h-16 rounded-xl mx-auto" />
          <Skeleton className="w-48 h-4 mx-auto" />
          <p className="text-muted-foreground">Validating your review link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isExpired = error.includes("expired");
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md" data-testid="card-review-token-error">
          <CardHeader>
            <div className="flex items-center gap-2">
              {isExpired ? (
                <Clock className="w-6 h-6 text-muted-foreground" />
              ) : (
                <AlertCircle className="w-6 h-6 text-destructive" />
              )}
              <CardTitle>{isExpired ? "Link Expired" : "Invalid Link"}</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {isExpired 
                ? "Your review window has closed. If you still want to provide feedback, please contact the interview administrator."
                : "This link may have been used already or is incorrect. Please check the link and try again."}
            </p>
            <Button 
              onClick={() => navigate("/")} 
              variant="outline"
              data-testid="button-go-home"
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
