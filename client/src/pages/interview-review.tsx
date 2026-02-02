import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, SkipForward, MessageSquare, CheckCircle, MessageSquareText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { QuestionReviewCard } from "@/components/review/QuestionReviewCard";
import { RatingSection } from "@/components/review/RatingSection";
import { ReviewLaterModal } from "@/components/review/ReviewLaterModal";
import { type ReviewRatings, type RatingDimensionKey } from "@shared/schema";

const LOCAL_STORAGE_KEY = "interview_review_draft";
const REVIEW_TOKEN_KEY = "review_access_token";

function getReviewToken(sessionId: string): string | null {
  return sessionStorage.getItem(`${REVIEW_TOKEN_KEY}_${sessionId}`);
}

function clearReviewToken(sessionId: string): void {
  sessionStorage.removeItem(`${REVIEW_TOKEN_KEY}_${sessionId}`);
}

export default function InterviewReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showLaterModal, setShowLaterModal] = useState(false);
  const [ratings, setRatings] = useState<ReviewRatings>({
    questionClarity: null,
    alviaUnderstanding: null,
    conversationFlow: null,
    comfortLevel: null,
    technicalQuality: null,
    overallExperience: null,
  });
  const [segmentComments, setSegmentComments] = useState<Record<string, string>>({});
  const [closingComments, setClosingComments] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/sessions", sessionId, "review"],
    queryFn: async () => {
      const token = sessionId ? getReviewToken(sessionId) : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers["x-review-token"] = token;
      }
      
      const response = await fetch(`/api/sessions/${sessionId}/review`, {
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const err = await response.json();
          throw new Error(err.message || "Failed to fetch review data");
        }
        // Handle non-JSON error responses (e.g., HTML 404 pages)
        if (response.status === 404) {
          throw new Error("Session not found or not yet completed. Please wait a moment and try again.");
        }
        throw new Error(`Failed to fetch review data (${response.status})`);
      }
      return response.json();
    },
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (sessionId) {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${sessionId}`);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.ratings) setRatings(draft.ratings);
          if (draft.segmentComments) setSegmentComments(draft.segmentComments);
          if (draft.closingComments) setClosingComments(draft.closingComments);
        } catch (e) {
          console.error("Failed to parse saved draft:", e);
        }
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (data?.segments) {
      const existingComments: Record<string, string> = {};
      data.segments.forEach((seg: any) => {
        existingComments[seg.id] = segmentComments[seg.id] ?? seg.respondentComment ?? "";
      });
      if (Object.keys(segmentComments).length === 0) {
        setSegmentComments(existingComments);
      }
    }
    if (data?.closingComments && !closingComments) {
      setClosingComments(data.closingComments);
    }
    if (data?.reviewRatings) {
      setRatings((prev) => ({
        ...prev,
        ...data.reviewRatings,
      }));
    }
  }, [data]);

  useEffect(() => {
    if (sessionId) {
      const draft = { ratings, segmentComments, closingComments };
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_${sessionId}`, JSON.stringify(draft));
    }
  }, [ratings, segmentComments, closingComments, sessionId]);

  const submitMutation = useMutation({
    mutationFn: async (skipped: boolean) => {
      const token = sessionId ? getReviewToken(sessionId) : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["x-review-token"] = token;
      }
      
      const response = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          ratings: skipped ? undefined : ratings,
          segmentComments: skipped ? undefined : Object.entries(segmentComments)
            .filter(([_, comment]) => comment.trim())
            .map(([segmentId, comment]) => ({ segmentId, comment })),
          closingComments: skipped ? undefined : closingComments,
          skipped,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to submit review");
      }
      return response.json();
    },
    onSuccess: () => {
      localStorage.removeItem(`${LOCAL_STORAGE_KEY}_${sessionId}`);
      if (sessionId) clearReviewToken(sessionId);
      toast({
        title: "Review submitted",
        description: "Thank you for your feedback!",
      });
      navigate("/interview/complete");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRatingChange = (key: RatingDimensionKey, value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
  };

  const handleCommentChange = (segmentId: string, comment: string) => {
    setSegmentComments((prev) => ({ ...prev, [segmentId]: comment }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Unable to Load Review</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Something went wrong"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/interview/complete")} data-testid="button-back-complete">
              Return to Completion Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const segments = data?.segments || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Review Your Interview</h1>
          <p className="text-muted-foreground">
            Take a moment to review your responses and provide any additional context or corrections.
          </p>
        </div>

        <div className="space-y-4">
          {segments.map((segment: any, index: number) => (
            <QuestionReviewCard
              key={segment.id}
              questionNumber={index + 1}
              questionText={segment.question?.questionText || "Question"}
              questionType={segment.question?.questionType || "open"}
              transcript={segment.transcript}
              summaryBullets={segment.summaryBullets}
              comment={segmentComments[segment.id] || ""}
              onCommentChange={(value) => handleCommentChange(segment.id, value)}
            />
          ))}
        </div>

        {/* Additional Questions Section */}
        {data?.additionalQuestionSegments && data.additionalQuestionSegments.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Follow-up Questions</h2>
            </div>
            {data.additionalQuestionSegments.map((segment: any, index: number) => (
              <QuestionReviewCard
                key={segment.id}
                questionNumber={index + 1}
                questionText={segment.question?.questionText || "Follow-up Question"}
                questionType="open"
                transcript={segment.transcript}
                summaryBullets={segment.summaryBullets}
                comment={segmentComments[segment.id] || ""}
                onCommentChange={(value) => handleCommentChange(segment.id, value)}
                isAdditionalQuestion
              />
            ))}
          </div>
        )}

        <RatingSection ratings={ratings} onChange={handleRatingChange} />

        <Card data-testid="card-closing-comments">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Final Comments
            </CardTitle>
            <CardDescription>
              Any additional thoughts or feedback about your interview experience?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Share any final thoughts..."
              value={closingComments}
              onChange={(e) => setClosingComments(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-closing-comments"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 justify-between pt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowLaterModal(true)}
              data-testid="button-review-later"
            >
              <Clock className="w-4 h-4 mr-2" />
              Review Later
            </Button>
            <Button
              variant="ghost"
              onClick={() => submitMutation.mutate(true)}
              disabled={submitMutation.isPending}
              data-testid="button-skip-review"
            >
              <SkipForward className="w-4 h-4 mr-2" />
              Skip Review
            </Button>
          </div>
          <Button
            onClick={() => submitMutation.mutate(false)}
            disabled={submitMutation.isPending}
            data-testid="button-submit-review"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {submitMutation.isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </div>

      <ReviewLaterModal
        sessionId={sessionId || ""}
        isOpen={showLaterModal}
        onClose={() => setShowLaterModal(false)}
      />
    </div>
  );
}
