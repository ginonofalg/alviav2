import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SessionScopeToggle } from "@/components/simulation/SessionScopeToggle";
import type { SessionScope } from "@shared/types/simulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronRight,
  Quote,
  Sparkles,
  MessageSquare,
  Target,
  Split,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { AnalyticsCascadeRefreshDialog } from "./AnalyticsCascadeRefreshDialog";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { SentimentIndicator, VerbatimQuote } from "./ThemeCard";
import type { 
  TemplateAnalytics, 
  CollectionPerformanceSummary, 
  QuestionConsistency, 
  ThemeSentiment,
  AggregatedThemeWithDetail,
  KeyFindingWithSource,
  ConsensusPointWithSource,
  DivergencePointWithSource,
} from "@shared/schema";

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
  const [isOpen, setIsOpen] = useState(false);
  const hasVerbatims = question.verbatims && question.verbatims.length > 0;
  const hasThemes = question.primaryThemes && question.primaryThemes.length > 0;
  
  return (
    <Card data-testid={`card-question-${index}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
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
              {hasThemes && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {question.primaryThemes.slice(0, 5).map((theme, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {theme}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasVerbatims && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid={`button-expand-question-${index}`}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Quote className="w-4 h-4 ml-1" />
                    <span className="ml-1 text-xs">{question.verbatims.length}</span>
                  </Button>
                </CollapsibleTrigger>
              )}
              {question.consistencyRating === "consistent" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : question.consistencyRating === "inconsistent" ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <Minus className="w-5 h-5 text-yellow-500" />
              )}
            </div>
          </div>
          
          <CollapsibleContent>
            {hasVerbatims && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Quote className="w-4 h-4" />
                  Representative Responses ({question.verbatims.length})
                </h4>
                <div className="space-y-2">
                  {question.verbatims.slice(0, 5).map((v, i) => (
                    <VerbatimQuote key={i} verbatim={v} index={i} />
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

const DEPTH_LABELS = {
  mentioned: { label: "Mentioned", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  explored: { label: "Explored", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  deeply_explored: { label: "Deep", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
};

function AggregatedThemeCard({ theme, index }: { 
  theme: AggregatedThemeWithDetail;
  index: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasVerbatims = theme.verbatims && theme.verbatims.length > 0;
  const depthStyle = DEPTH_LABELS[theme.depth] || DEPTH_LABELS.mentioned;
  
  return (
    <Card data-testid={`card-agg-theme-${index}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium" data-testid={`text-agg-theme-name-${index}`}>{theme.theme}</h4>
                <SentimentIndicator sentiment={theme.sentiment} />
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${depthStyle.color}`}>
                  {depthStyle.label}
                </span>
                {theme.isEmergent && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="w-3 h-3" />
                    Emergent
                  </Badge>
                )}
              </div>
              {theme.description && (
                <p className="text-sm text-muted-foreground mt-1">{theme.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span data-testid={`text-mentions-${index}`}>{theme.totalMentions} mentions</span>
                <span data-testid={`text-collections-appeared-${index}`}>{theme.collectionsAppeared} collections</span>
              </div>
              {theme.collectionSources && theme.collectionSources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {theme.collectionSources.slice(0, 4).map((src, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {src.collectionName}
                    </Badge>
                  ))}
                  {theme.collectionSources.length > 4 && (
                    <Badge variant="secondary" className="text-xs">
                      +{theme.collectionSources.length - 4} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasVerbatims && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid={`button-expand-theme-${index}`}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Quote className="w-4 h-4 ml-1" />
                    <span className="ml-1 text-xs">{theme.verbatims.length}</span>
                  </Button>
                </CollapsibleTrigger>
              )}
              <div className="flex items-center gap-2" data-testid={`bar-prevalence-${index}`}>
                <Progress value={theme.avgPrevalence} className="w-16" />
                <span className="text-xs text-muted-foreground">{theme.avgPrevalence}%</span>
              </div>
            </div>
          </div>
          
          <CollapsibleContent>
            {hasVerbatims && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Quote className="w-4 h-4" />
                  Supporting Quotes ({theme.verbatims.length})
                </h4>
                <div className="space-y-2">
                  {theme.verbatims.slice(0, 7).map((v, i) => (
                    <VerbatimQuote key={i} verbatim={v} index={i} />
                  ))}
                  {theme.verbatims.length > 7 && (
                    <p className="text-xs text-muted-foreground">
                      +{theme.verbatims.length - 7} more quotes
                    </p>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

function KeyFindingCard({ finding, index }: { finding: KeyFindingWithSource; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasVerbatims = finding.supportingVerbatims && finding.supportingVerbatims.length > 0;
  
  return (
    <Card data-testid={`card-finding-${index}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <Badge variant="outline" className="text-xs">{finding.sourceCollectionName}</Badge>
              </div>
              <p className="font-medium">{finding.finding}</p>
              <p className="text-sm text-muted-foreground mt-1">{finding.significance}</p>
              {finding.relatedThemes && finding.relatedThemes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {finding.relatedThemes.map((theme, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{theme}</Badge>
                  ))}
                </div>
              )}
            </div>
            {hasVerbatims && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Quote className="w-4 h-4 ml-1" />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
          
          <CollapsibleContent>
            {hasVerbatims && (
              <div className="mt-4 pt-4 border-t space-y-2">
                {finding.supportingVerbatims.slice(0, 3).map((v, i) => (
                  <VerbatimQuote key={i} verbatim={v} index={i} />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

function ConsensusCard({ consensus, index }: { consensus: ConsensusPointWithSource; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasVerbatims = consensus.verbatims && consensus.verbatims.length > 0;
  
  return (
    <Card data-testid={`card-consensus-${index}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-green-500" />
                <Badge variant="outline" className="text-xs">{consensus.sourceCollectionName}</Badge>
                <Badge variant="secondary" className="text-xs">{consensus.agreementLevel}% agreement</Badge>
              </div>
              <p className="font-medium">{consensus.topic}</p>
              <p className="text-sm text-muted-foreground mt-1">{consensus.position}</p>
            </div>
            {hasVerbatims && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Quote className="w-4 h-4 ml-1" />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
          
          <CollapsibleContent>
            {hasVerbatims && (
              <div className="mt-4 pt-4 border-t space-y-2">
                {consensus.verbatims.slice(0, 3).map((v, i) => (
                  <VerbatimQuote key={i} verbatim={v} index={i} />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

function DivergenceCard({ divergence, index }: { divergence: DivergencePointWithSource; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Card data-testid={`card-divergence-${index}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Split className="w-4 h-4 text-orange-500" />
                <Badge variant="outline" className="text-xs">{divergence.sourceCollectionName}</Badge>
              </div>
              <p className="font-medium">{divergence.topic}</p>
              <div className="mt-2 space-y-1">
                {divergence.perspectives.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{p.count}x:</span>
                    <span>{p.position}</span>
                  </div>
                ))}
              </div>
            </div>
            {divergence.perspectives.some(p => p.verbatims && p.verbatims.length > 0) && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Quote className="w-4 h-4 ml-1" />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
          
          <CollapsibleContent>
            <div className="mt-4 pt-4 border-t space-y-3">
              {divergence.perspectives.map((p, pIdx) => (
                p.verbatims && p.verbatims.length > 0 && (
                  <div key={pIdx}>
                    <p className="text-sm font-medium mb-2">{p.position}:</p>
                    {p.verbatims.slice(0, 2).map((v, i) => (
                      <VerbatimQuote key={i} verbatim={v} index={i} />
                    ))}
                  </div>
                )
              ))}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

export function TemplateAnalyticsView({ templateId, templateName }: TemplateAnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showCascadeDialog, setShowCascadeDialog] = useState(false);
  const [sessionScope, setSessionScope] = useState<SessionScope>("real");

  const { data, isLoading } = useQuery<TemplateAnalyticsResponse>({
    queryKey: ["/api/templates", templateId, "analytics", sessionScope],
    enabled: !!templateId,
    queryFn: async () => {
      const res = await fetch(`/api/templates/${templateId}/analytics?sessionScope=${sessionScope}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // The cascade dialog now handles query invalidation directly
  const handleRefreshSuccess = () => {
    // Intentionally empty - dialog handles invalidation
  };

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
          <SessionScopeToggle value={sessionScope} onChange={setSessionScope} />
          {data?.isStale && (
            <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600/30" data-testid="badge-stale">
              <AlertTriangle className="w-3 h-3" />
              Out of date
            </Badge>
          )}
          {data?.missingAnalytics !== undefined && data.missingAnalytics > 0 && (
            <Badge variant="outline" className="gap-1" data-testid="badge-missing-analytics">
              <AlertTriangle className="w-3 h-3" />
              {data.missingAnalytics} collection{data.missingAnalytics === 1 ? '' : 's'} need analytics
            </Badge>
          )}
          {data?.currentCollectionCount === 0 && data?.totalCollectionCount > 0 && (
            <Badge variant="outline" className="gap-1 text-muted-foreground" data-testid="badge-no-data">
              No collection analytics available yet
            </Badge>
          )}
          {data?.lastAnalyzedAt && (
            <span className="text-xs text-muted-foreground" data-testid="text-last-updated">
              Last updated: {new Date(data.lastAnalyzedAt).toLocaleDateString()}
            </span>
          )}
          <Button
            onClick={() => setShowCascadeDialog(true)}
            disabled={data?.currentCollectionCount === 0 && data?.totalCollectionCount === 0}
            data-testid="button-refresh-analytics"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Analytics
          </Button>
        </div>
      </div>

      <AnalyticsCascadeRefreshDialog
        open={showCascadeDialog}
        onOpenChange={setShowCascadeDialog}
        level="template"
        entityId={templateId}
        entityName={templateName}
        onSuccess={handleRefreshSuccess}
        sessionScope={sessionScope}
      />

      {!hasData || !analytics ? (
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
          <TabsList data-testid="tabs-list" className="flex-wrap">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="collections" data-testid="tab-collections">Collections ({analytics.collectionPerformance.length})</TabsTrigger>
            <TabsTrigger value="questions" data-testid="tab-questions">Questions</TabsTrigger>
            <TabsTrigger value="themes" data-testid="tab-themes">Themes ({analytics.aggregatedThemes.length})</TabsTrigger>
            <TabsTrigger value="insights" data-testid="tab-insights">
              Insights ({(analytics.keyFindings?.length || 0) + (analytics.consensusPoints?.length || 0) + (analytics.divergencePoints?.length || 0)})
            </TabsTrigger>
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

          <TabsContent value="insights" className="space-y-6 mt-6" data-testid="content-insights">
            <CardDescription>Key findings, consensus points, and divergence points from all collections.</CardDescription>
            
            {analytics.keyFindings && analytics.keyFindings.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Key Findings ({analytics.keyFindings.length})
                </h3>
                {analytics.keyFindings.map((finding, idx) => (
                  <KeyFindingCard key={idx} finding={finding} index={idx} />
                ))}
              </div>
            )}

            {analytics.consensusPoints && analytics.consensusPoints.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" />
                  Consensus Points ({analytics.consensusPoints.length})
                </h3>
                {analytics.consensusPoints.map((consensus, idx) => (
                  <ConsensusCard key={idx} consensus={consensus} index={idx} />
                ))}
              </div>
            )}

            {analytics.divergencePoints && analytics.divergencePoints.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Split className="w-5 h-5 text-orange-500" />
                  Divergence Points ({analytics.divergencePoints.length})
                </h3>
                {analytics.divergencePoints.map((divergence, idx) => (
                  <DivergenceCard key={idx} divergence={divergence} index={idx} />
                ))}
              </div>
            )}

            {(!analytics.keyFindings || analytics.keyFindings.length === 0) &&
             (!analytics.consensusPoints || analytics.consensusPoints.length === 0) &&
             (!analytics.divergencePoints || analytics.divergencePoints.length === 0) && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No insights data available. Refresh template analytics to populate from collections.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
