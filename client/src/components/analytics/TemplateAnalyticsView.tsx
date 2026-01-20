import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  Lightbulb,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { SentimentIndicator } from "./ThemeCard";
import type { TemplateAnalytics, CollectionPerformanceSummary, QuestionConsistency, ThemeSentiment } from "@shared/schema";

interface TemplateAnalyticsResponse {
  analytics: TemplateAnalytics | null;
  lastAnalyzedAt: string | null;
  analyzedCollectionCount: number;
  currentCollectionCount: number;
  totalCollectionCount: number;
  isStale: boolean;
  missingAnalytics: number;
}

interface TemplateAnalyticsViewProps {
  templateId: string;
  templateName: string;
}

const CONSISTENCY_COLORS = {
  consistent: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Consistent" },
  variable: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: "Variable" },
  inconsistent: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Inconsistent" },
};

function CollectionComparisonCard({ collection }: { collection: CollectionPerformanceSummary }) {
  return (
    <Card data-testid={`card-collection-${collection.collectionId}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground truncate" data-testid={`text-collection-name-${collection.collectionId}`}>
              {collection.collectionName}
            </h4>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span data-testid={`text-collection-sessions-${collection.collectionId}`}>{collection.sessionCount} sessions</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                <span data-testid={`text-collection-quality-${collection.collectionId}`}>{collection.avgQualityScore}% quality</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span data-testid={`text-collection-duration-${collection.collectionId}`}>{collection.avgSessionDuration} min</span>
              </div>
            </div>
            {collection.topThemes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {collection.topThemes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-theme-${collection.collectionId}-${i}`}>
                    {theme}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <SentimentBreakdown sentiment={collection.sentimentDistribution} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SentimentBreakdown({ sentiment }: { sentiment: { positive: number; neutral: number; negative: number } }) {
  return (
    <div className="flex flex-col gap-1" data-testid="breakdown-sentiment">
      <div className="flex items-center gap-1 text-xs">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-muted-foreground">{sentiment.positive}%</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-muted-foreground">{sentiment.neutral}%</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-muted-foreground">{sentiment.negative}%</span>
      </div>
    </div>
  );
}

function QuestionConsistencyCard({ question, index }: { question: QuestionConsistency; index: number }) {
  const consistencyStyle = CONSISTENCY_COLORS[question.consistencyRating];
  
  return (
    <Card data-testid={`card-question-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground" data-testid={`text-question-number-${index}`}>Q{question.questionIndex + 1}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${consistencyStyle.bg} ${consistencyStyle.text}`} data-testid={`badge-consistency-${index}`}>
                {consistencyStyle.label}
              </span>
            </div>
            <p className="text-sm mt-1 line-clamp-2" data-testid={`text-question-text-${index}`}>{question.questionText}</p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span data-testid={`text-quality-avg-${index}`}>Avg Quality: {question.avgQualityAcrossCollections}%</span>
              <span data-testid={`text-words-avg-${index}`}>Avg Words: {question.avgWordCountAcrossCollections}</span>
              {question.qualityVariance > 0 && (
                <span data-testid={`text-variance-${index}`}>Variance: {Math.round(Math.sqrt(question.qualityVariance))}</span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            {question.consistencyRating === "consistent" ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : question.consistencyRating === "inconsistent" ? (
              <XCircle className="w-5 h-5 text-red-500" />
            ) : (
              <Minus className="w-5 h-5 text-yellow-500" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AggregatedThemeCard({ theme, index }: { 
  theme: { theme: string; totalMentions: number; collectionsAppeared: number; avgPrevalence: number; sentiment: ThemeSentiment };
  index: number;
}) {
  return (
    <Card data-testid={`card-agg-theme-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium" data-testid={`text-agg-theme-name-${index}`}>{theme.theme}</h4>
              <SentimentIndicator sentiment={theme.sentiment} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span data-testid={`text-mentions-${index}`}>{theme.totalMentions} total mentions</span>
              <span data-testid={`text-collections-appeared-${index}`}>{theme.collectionsAppeared} collections</span>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid={`bar-prevalence-${index}`}>
            <Progress value={theme.avgPrevalence} className="w-20" />
            <span className="text-xs text-muted-foreground">{theme.avgPrevalence}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TemplateAnalyticsView({ templateId, templateName }: TemplateAnalyticsViewProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data, isLoading } = useQuery<TemplateAnalyticsResponse>({
    queryKey: ["/api/templates", templateId, "analytics"],
    enabled: !!templateId,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequestJson<TemplateAnalyticsResponse>(
        "POST",
        `/api/templates/${templateId}/analytics/refresh`,
        undefined,
        { timeoutMs: 120000 },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/templates", templateId, "analytics"],
      });
      toast({
        title: "Analysis complete",
        description: "Template analytics have been refreshed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="skeleton-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const analytics = data?.analytics;
  const hasData = analytics !== null;

  return (
    <div className="space-y-6" data-testid="container-template-analytics">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold" data-testid="heading-template-analytics">Template Analytics</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-template-name">{templateName}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {data?.missingAnalytics && data.missingAnalytics > 0 && (
            <Badge variant="outline" className="gap-1" data-testid="badge-missing-analytics">
              <AlertTriangle className="w-3 h-3" />
              {data.missingAnalytics} collection(s) need analytics
            </Badge>
          )}
          {data?.isStale && (
            <Badge variant="outline" className="gap-1" data-testid="badge-stale">
              <AlertTriangle className="w-3 h-3" />
              Data may be outdated
            </Badge>
          )}
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || data?.currentCollectionCount === 0}
            data-testid="button-refresh-analytics"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            {refreshMutation.isPending ? "Analyzing..." : "Refresh Analytics"}
          </Button>
        </div>
      </div>

      {!hasData ? (
        <Card data-testid="card-no-analytics">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Analytics Available</h3>
            <p className="text-muted-foreground mb-4">
              {data?.currentCollectionCount === 0
                ? "No collections with analytics yet. Please refresh analytics for at least one collection first."
                : "Click the Refresh Analytics button to generate template-level insights."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="collections" data-testid="tab-collections">Collections ({analytics.collectionPerformance.length})</TabsTrigger>
            <TabsTrigger value="questions" data-testid="tab-questions">Question Consistency</TabsTrigger>
            <TabsTrigger value="themes" data-testid="tab-themes">Themes ({analytics.aggregatedThemes.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6" data-testid="content-overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-stat-collections">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold" data-testid="text-total-collections">{analytics.templateEffectiveness.totalCollections}</p>
                      <p className="text-sm text-muted-foreground">Collections</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-sessions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold" data-testid="text-total-sessions">{analytics.templateEffectiveness.totalSessions}</p>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-quality">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold" data-testid="text-avg-quality">{analytics.templateEffectiveness.avgQualityScore}%</p>
                      <p className="text-sm text-muted-foreground">Avg Quality</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-duration">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold" data-testid="text-avg-duration">{analytics.templateEffectiveness.avgSessionDuration} min</p>
                      <p className="text-sm text-muted-foreground">Avg Duration</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {analytics.recommendations.length > 0 && (
              <RecommendationsPanel recommendations={analytics.recommendations} />
            )}
          </TabsContent>

          <TabsContent value="collections" className="space-y-4 mt-6" data-testid="content-collections">
            <CardDescription>Compare performance across different collection deployments of this template.</CardDescription>
            {analytics.collectionPerformance.map((collection) => (
              <CollectionComparisonCard key={collection.collectionId} collection={collection} />
            ))}
            {analytics.collectionPerformance.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No collections with analytics data available.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="questions" className="space-y-4 mt-6" data-testid="content-questions">
            <CardDescription>See how each question performs consistently across collections.</CardDescription>
            {analytics.questionConsistency.map((question, idx) => (
              <QuestionConsistencyCard key={question.questionIndex} question={question} index={idx} />
            ))}
            {analytics.questionConsistency.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No question consistency data available.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="themes" className="space-y-4 mt-6" data-testid="content-themes">
            <CardDescription>Themes aggregated across all collections using this template.</CardDescription>
            {analytics.aggregatedThemes.map((theme, idx) => (
              <AggregatedThemeCard key={idx} theme={theme} index={idx} />
            ))}
            {analytics.aggregatedThemes.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No aggregated theme data available.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
