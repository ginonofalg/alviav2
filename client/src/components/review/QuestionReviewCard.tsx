import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronDown, MessageSquare } from "lucide-react";
import { useState } from "react";

interface QuestionReviewCardProps {
  questionNumber: number;
  questionText: string;
  questionType: string;
  transcript: string | null;
  summaryBullets: string[] | null;
  comment: string;
  onCommentChange: (value: string) => void;
}

export function QuestionReviewCard({
  questionNumber,
  questionText,
  questionType,
  transcript,
  summaryBullets,
  comment,
  onCommentChange,
}: QuestionReviewCardProps) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <Card data-testid={`card-question-review-${questionNumber}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Q{questionNumber}</Badge>
            <Badge variant="secondary" className="text-xs">
              {questionType}
            </Badge>
          </div>
        </div>
        <CardTitle className="text-base font-medium mt-2">
          {questionText}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summaryBullets && summaryBullets.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Summary</div>
            <ul className="space-y-1">
              {summaryBullets.map((bullet, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {transcript && (
          <details className="group" open={showTranscript}>
            <summary 
              className="text-sm text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault();
                setShowTranscript(!showTranscript);
              }}
              data-testid={`button-toggle-transcript-${questionNumber}`}
            >
              <ChevronDown className={cn("w-4 h-4 transition-transform", showTranscript && "rotate-180")} />
              View full transcript
            </summary>
            {showTranscript && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                {transcript}
              </div>
            )}
          </details>
        )}

        <div className="space-y-2 pt-2 border-t">
          <Label htmlFor={`comment-${questionNumber}`} className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Add a comment (optional)
          </Label>
          <Textarea
            id={`comment-${questionNumber}`}
            placeholder="Clarify meaning, correct errors, or add context..."
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            className="min-h-[80px] resize-none"
            data-testid={`input-comment-${questionNumber}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
