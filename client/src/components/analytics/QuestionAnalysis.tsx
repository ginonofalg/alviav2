import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronUp, 
  MessageSquare,
  Quote,
  BarChart3
} from "lucide-react";
import type { EnhancedQuestionPerformance, ThemeVerbatim } from "@shared/schema";
import { VerbatimQuote } from "./ThemeCard";

interface QuestionAnalysisProps {
  questions: EnhancedQuestionPerformance[];
  participantLabels?: Map<string, string>;
}

const RICHNESS_LABELS: Record<string, { label: string; color: string }> = {
  brief: { label: "Brief responses", color: "text-yellow-600 dark:text-yellow-400" },
  moderate: { label: "Moderate detail", color: "text-blue-600 dark:text-blue-400" },
  detailed: { label: "Detailed responses", color: "text-green-600 dark:text-green-400" },
};

const PERSPECTIVE_LABELS: Record<string, { label: string; color: string }> = {
  narrow: { label: "Narrow range", color: "text-yellow-600 dark:text-yellow-400" },
  moderate: { label: "Moderate diversity", color: "text-blue-600 dark:text-blue-400" },
  diverse: { label: "Diverse perspectives", color: "text-green-600 dark:text-green-400" },
};

function QualityBars({ score }: { score: number }) {
  const bars = Math.ceil(score / 20);
  const colorClass = score >= 80 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="quality-bars">
      <div className="flex gap-0.5 flex-wrap">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-1.5 h-4 rounded-sm ${i <= bars ? colorClass : "bg-muted"}`}
          />
        ))}
      </div>
      <span 
        className={`text-sm font-medium ${
          score >= 80 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-red-500"
        }`}
        data-testid="text-quality-score"
      >
        {score}%
      </span>
    </div>
  );
}

function QuestionCard({ question, participantLabels }: { 
  question: EnhancedQuestionPerformance;
  participantLabels?: Map<string, string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Backward compatibility: ensure all fields have defaults
  const verbatims = question.verbatims || [];
  const primaryThemes = question.primaryThemes || [];
  const responseRichness = question.responseRichness || "moderate";
  const perspectiveRange = question.perspectiveRange || "moderate";
  
  const richness = RICHNESS_LABELS[responseRichness] || RICHNESS_LABELS.moderate;
  const perspective = PERSPECTIVE_LABELS[perspectiveRange] || PERSPECTIVE_LABELS.moderate;
  
  return (
    <Card data-testid={`question-card-${question.questionIndex}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs" data-testid={`badge-question-number-${question.questionIndex}`}>
                Q{question.questionIndex + 1}
              </Badge>
              <h4 className="font-medium text-foreground truncate" data-testid={`text-question-${question.questionIndex}`}>{question.questionText}</h4>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-1.5 flex-wrap">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground" data-testid={`text-response-count-${question.questionIndex}`}>{question.responseCount} responses</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground" data-testid={`text-avg-words-${question.questionIndex}`}>Avg {question.avgWordCount} words</span>
              </div>
              <QualityBars score={question.avgQualityScore} />
            </div>
            
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className={richness.color} data-testid={`text-richness-${question.questionIndex}`}>{richness.label}</span>
              <span className={perspective.color} data-testid={`text-perspective-${question.questionIndex}`}>{perspective.label}</span>
            </div>
            
            {primaryThemes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {primaryThemes.map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-theme-${question.questionIndex}-${i}`}>
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          {verbatims.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex-shrink-0"
              data-testid={`button-expand-question-${question.questionIndex}`}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
        
        {isExpanded && verbatims.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <h5 className="text-sm font-medium flex items-center gap-2 flex-wrap" data-testid={`heading-responses-${question.questionIndex}`}>
              <Quote className="w-4 h-4" />
              Representative Responses
            </h5>
            {verbatims.map((v, i) => (
              <VerbatimQuote key={i} verbatim={v} index={i} participantLabels={participantLabels} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function QuestionAnalysis({ questions, participantLabels }: QuestionAnalysisProps) {
  if (questions.length === 0) {
    return (
      <Card data-testid="empty-question-analysis">
        <CardContent className="py-8 text-center">
          <BarChart3 className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-medium mb-2" data-testid="text-no-questions-heading">No question data</h3>
          <p className="text-sm text-muted-foreground" data-testid="text-no-questions-message">
            Question performance data will appear here after analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <QuestionCard key={i} question={q} participantLabels={participantLabels} />
      ))}
    </div>
  );
}

export { QuestionCard, QualityBars };
