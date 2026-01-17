import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Lightbulb, 
  AlertTriangle, 
  Search, 
  MessageCircle,
  ArrowRight
} from "lucide-react";
import type { Recommendation } from "@shared/schema";

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
}

const RECOMMENDATION_ICONS: Record<Recommendation["type"], typeof Lightbulb> = {
  question_improvement: AlertTriangle,
  explore_deeper: Search,
  coverage_gap: Lightbulb,
  needs_probing: MessageCircle,
};

const RECOMMENDATION_COLORS: Record<Recommendation["type"], { border: string; icon: string }> = {
  question_improvement: { border: "border-orange-200/50 dark:border-orange-800/30", icon: "text-orange-500" },
  explore_deeper: { border: "border-blue-200/50 dark:border-blue-800/30", icon: "text-blue-500" },
  coverage_gap: { border: "border-purple-200/50 dark:border-purple-800/30", icon: "text-purple-500" },
  needs_probing: { border: "border-green-200/50 dark:border-green-800/30", icon: "text-green-500" },
};

const PRIORITY_COLORS: Record<Recommendation["priority"], string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function RecommendationCard({ recommendation, index }: { recommendation: Recommendation; index: number }) {
  const Icon = RECOMMENDATION_ICONS[recommendation.type] || Lightbulb;
  const colors = RECOMMENDATION_COLORS[recommendation.type] || RECOMMENDATION_COLORS.coverage_gap;
  const relatedQuestions = recommendation.relatedQuestions || [];
  
  return (
    <Card 
      className={colors.border}
      data-testid={`recommendation-card-${index}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Icon className={`w-4 h-4 ${colors.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-foreground" data-testid={`text-recommendation-title-${index}`}>{recommendation.title}</h4>
              <Badge className={`${PRIORITY_COLORS[recommendation.priority]} border-0 text-xs`} data-testid={`badge-priority-${index}`}>
                {recommendation.priority}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-recommendation-description-${index}`}>{recommendation.description}</p>
            
            {relatedQuestions.length > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground flex-wrap" data-testid={`text-related-questions-${index}`}>
                <ArrowRight className="w-3 h-3" />
                Questions: {relatedQuestions.map(q => `Q${q + 1}`).join(", ")}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecommendationsPanel({ recommendations }: RecommendationsPanelProps) {
  if (recommendations.length === 0) {
    return null;
  }

  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return (
    <Card data-testid="recommendations-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 flex-wrap" data-testid="heading-recommendations">
          <Lightbulb className="w-5 h-5 text-primary" />
          Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedRecommendations.map((r, i) => (
            <RecommendationCard key={i} recommendation={r} index={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export { RecommendationCard };
