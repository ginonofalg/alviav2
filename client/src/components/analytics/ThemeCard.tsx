import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronUp, 
  Quote, 
  TrendingUp, 
  Users,
  Sparkles
} from "lucide-react";
import type { EnhancedTheme, ThemeVerbatim, ThemeSentiment } from "@shared/schema";

interface ThemeCardProps {
  theme: EnhancedTheme;
  participantLabels?: Map<string, string>;
}

const SENTIMENT_COLORS: Record<ThemeSentiment, { bg: string; text: string; label: string }> = {
  positive: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Positive" },
  neutral: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", label: "Neutral" },
  negative: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Negative" },
  mixed: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Mixed" },
};

const DEPTH_LABELS: Record<string, { label: string; color: string }> = {
  mentioned: { label: "Briefly mentioned", color: "bg-gray-300 dark:bg-gray-600" },
  explored: { label: "Explored", color: "bg-blue-400 dark:bg-blue-500" },
  deeply_explored: { label: "Deeply explored", color: "bg-green-500" },
};

function DepthMeter({ depth, score }: { depth: string; score: number }) {
  const segments = depth === "mentioned" ? 1 : depth === "explored" ? 2 : 3;
  const depthLabel = DEPTH_LABELS[depth] || DEPTH_LABELS.explored;
  
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid={`meter-depth-${depth}`}>
      <div className="flex gap-0.5 flex-wrap">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-2 h-4 rounded-sm ${
              i <= segments ? depthLabel.color : "bg-muted"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground" data-testid="text-depth-label">
        {depthLabel.label}
      </span>
    </div>
  );
}

function SentimentIndicator({ sentiment }: { sentiment: ThemeSentiment }) {
  const style = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.neutral;
  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
      data-testid={`indicator-sentiment-${sentiment}`}
    >
      {style.label}
    </span>
  );
}

function PrevalenceBar({ prevalence }: { prevalence: number }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="bar-prevalence">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${prevalence}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground" data-testid="text-prevalence">{prevalence}%</span>
    </div>
  );
}

function VerbatimQuote({ verbatim, index, participantLabels }: { 
  verbatim: ThemeVerbatim; 
  index: number;
  participantLabels?: Map<string, string>;
}) {
  const label = participantLabels?.get(verbatim.sessionId) || `Participant`;
  const sentimentStyle = SENTIMENT_COLORS[verbatim.sentiment] || SENTIMENT_COLORS.neutral;
  
  return (
    <div className="pl-4 border-l-2 border-muted-foreground/20 py-2" data-testid={`verbatim-${index}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <Quote className="w-3 h-3 mt-1 text-muted-foreground/50 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm italic text-foreground/80" data-testid={`text-verbatim-quote-${index}`}>"{verbatim.quote}"</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground" data-testid={`text-verbatim-participant-${index}`}>{label}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground" data-testid={`text-verbatim-question-${index}`}>Q{verbatim.questionIndex + 1}</span>
            <span className={`text-xs ${sentimentStyle.text}`} data-testid={`text-verbatim-sentiment-${index}`}>{sentimentStyle.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeCard({ theme, participantLabels }: ThemeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Backward compatibility: ensure all fields have defaults
  const verbatims = theme.verbatims || [];
  const sentiment = theme.sentiment || "neutral";
  const depth = theme.depth || "explored";
  const depthScore = theme.depthScore ?? 50;
  const prevalence = theme.prevalence ?? 0;
  const subThemes = theme.subThemes || [];

  return (
    <Card className="overflow-hidden" data-testid={`theme-card-${theme.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-foreground" data-testid={`text-theme-name-${theme.id}`}>{theme.theme}</h4>
              {theme.isEmergent && (
                <Badge variant="outline" className="gap-1 text-xs" data-testid={`badge-emergent-${theme.id}`}>
                  <Sparkles className="w-3 h-3" />
                  Emergent
                </Badge>
              )}
              <SentimentIndicator sentiment={sentiment} />
            </div>
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-theme-description-${theme.id}`}>{theme.description}</p>
            
            <div className="flex flex-wrap items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground" data-testid={`text-theme-count-${theme.id}`}>
                  {theme.count} {theme.count === 1 ? 'participant' : 'participants'}
                </span>
              </div>
              <PrevalenceBar prevalence={prevalence} />
              <DepthMeter depth={depth} score={depthScore} />
            </div>
            
            {subThemes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {subThemes.map((sub, i) => (
                  <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-subtheme-${theme.id}-${i}`}>
                    {sub}
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
              data-testid={`button-expand-theme-${theme.id}`}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
        
        {isExpanded && verbatims.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <h5 className="text-sm font-medium flex items-center gap-2 flex-wrap" data-testid={`heading-verbatims-${theme.id}`}>
              <Quote className="w-4 h-4" />
              Supporting Verbatims
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

export { SentimentIndicator, DepthMeter, PrevalenceBar, VerbatimQuote };
