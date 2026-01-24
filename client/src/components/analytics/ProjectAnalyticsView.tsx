import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Clock,
  Users,
  FileText,
  Lightbulb,
  Target,
  Star,
  Quote,
  TrendingUp,
  Layers,
  Sparkles,
  CheckCircle,
  MessageSquareQuote,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { SentimentIndicator, VerbatimQuote } from "./ThemeCard";
import { AnalyticsPdfExport } from "./AnalyticsPdfExport";
import { AnalyticsCascadeRefreshDialog } from "./AnalyticsCascadeRefreshDialog";
import type { ProjectAnalytics, TemplatePerformanceSummary, CrossTemplateTheme, ThemeVerbatim, ThemeSentiment } from "@shared/schema";

interface ProjectAnalyticsResponse {
  analytics: ProjectAnalytics | null;
  lastAnalyzedAt: string | null;
  analyzedTemplateCount: number;
  currentTemplateCount: number;
  totalTemplateCount: number;
  isStale: boolean;
  missingAnalytics: number;
}

interface ProjectAnalyticsViewProps {
  projectId: string;
  projectName: string;
}

function TemplateComparisonCard({ template }: { template: TemplatePerformanceSummary }) {
  return (
    <Card data-testid={`card-template-${template.templateId}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground truncate" data-testid={`text-template-name-${template.templateId}`}>
              {template.templateName}
            </h4>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                <span data-testid={`text-template-collections-${template.templateId}`}>{template.collectionCount} collections</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span data-testid={`text-template-sessions-${template.templateId}`}>{template.totalSessions} sessions</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                <span data-testid={`text-template-quality-${template.templateId}`}>{template.avgQualityScore}% quality</span>
              </div>
            </div>
            {template.topThemes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {template.topThemes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-theme-${template.templateId}-${i}`}>
                    {theme}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <SentimentBreakdown sentiment={template.sentimentDistribution} />
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

function CrossTemplateThemeCard({ theme, index }: { theme: CrossTemplateTheme; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card data-testid={`card-cross-theme-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium" data-testid={`text-cross-theme-name-${index}`}>{theme.theme}</h4>
              <SentimentIndicator sentiment={theme.sentiment} />
              {theme.isStrategic && (
                <Badge variant="default" className="gap-1 text-xs" data-testid={`badge-strategic-${index}`}>
                  <Star className="w-3 h-3" />
                  Strategic
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-cross-theme-desc-${index}`}>{theme.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span data-testid={`text-cross-templates-${index}`}>
                <Layers className="w-3 h-3 inline mr-1" />
                {theme.templatesAppeared.length} templates
              </span>
              <span data-testid={`text-cross-mentions-${index}`}>{theme.totalMentions} mentions</span>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid={`bar-cross-prevalence-${index}`}>
            <Progress value={theme.avgPrevalence} className="w-20" />
            <span className="text-xs text-muted-foreground">{theme.avgPrevalence}%</span>
          </div>
        </div>
        {theme.verbatims && theme.verbatims.length > 0 && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs"
              data-testid={`button-expand-cross-theme-${index}`}
            >
              <Quote className="w-3 h-3 mr-1" />
              {isExpanded ? "Hide" : "Show"} verbatims ({theme.verbatims.length})
            </Button>
            {isExpanded && (
              <div className="mt-2 space-y-2">
                {theme.verbatims.map((v, i) => (
                  <VerbatimQuote key={i} verbatim={v} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StrategicInsightCard({ insight, index }: { 
  insight: { insight: string; significance: string; supportingTemplates: string[]; verbatims: ThemeVerbatim[] };
  index: number;
}) {
  return (
    <Card data-testid={`card-insight-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <p className="font-medium" data-testid={`text-insight-${index}`}>{insight.insight}</p>
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-significance-${index}`}>{insight.significance}</p>
            {insight.supportingTemplates.length > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Layers className="w-3 h-3" />
                <span>Based on {insight.supportingTemplates.length} template(s)</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutiveSummaryCard({ summary }: { 
  summary: { headline: string; keyTakeaways: string[]; recommendedActions: string[] };
}) {
  return (
    <Card className="border-2 border-primary/20" data-testid="card-executive-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Executive Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-lg font-medium" data-testid="text-summary-headline">{summary.headline}</p>
        
        {summary.keyTakeaways.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Takeaways</h4>
            <ul className="space-y-2">
              {summary.keyTakeaways.map((takeaway, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-takeaway-${i}`}>
                  <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  {takeaway}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.recommendedActions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Recommended Actions</h4>
            <ul className="space-y-2">
              {summary.recommendedActions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-action-${i}`}>
                  <Target className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Context Type Labels for display
const CONTEXT_TYPE_LABELS: Record<string, { label: string; icon: typeof Sparkles }> = {
  content: { label: "Content Strategy", icon: FileText },
  product: { label: "Product Development", icon: Target },
  marketing: { label: "Marketing", icon: TrendingUp },
  cx: { label: "Customer Experience", icon: Users },
  other: { label: "General", icon: Lightbulb },
};

function ContextualRecommendationsCard({ 
  contextualRecommendations,
  crossTemplateThemes,
}: { 
  contextualRecommendations: NonNullable<ProjectAnalytics["contextualRecommendations"]>;
  crossTemplateThemes: CrossTemplateTheme[];
}) {
  const contextInfo = CONTEXT_TYPE_LABELS[contextualRecommendations.contextType] || CONTEXT_TYPE_LABELS.other;
  
  const getThemeName = (themeId: string): string => {
    const theme = crossTemplateThemes.find(t => t.id === themeId);
    return theme?.theme || themeId;
  };
  
  return (
    <div className="space-y-6" data-testid="container-contextual-recommendations">
      <Card className="border-2 border-muted-foreground/20" data-testid="card-context-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            Tailored Recommendations
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <contextInfo.icon className="w-3 h-3" />
              {contextInfo.label}
            </Badge>
            <span className="text-muted-foreground">Based on your strategic context</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted/50 rounded-md">
            <p className="text-sm font-medium text-muted-foreground mb-1">Your Context</p>
            <p className="text-sm" data-testid="text-strategic-context">
              {contextualRecommendations.strategicContext}
            </p>
          </div>
          
          <div>
            <p className="font-medium mb-2" data-testid="text-strategic-summary">
              {contextualRecommendations.strategicSummary}
            </p>
          </div>
        </CardContent>
      </Card>

      {contextualRecommendations.actionItems.length > 0 && (
        <Card data-testid="card-action-items">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Recommended Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contextualRecommendations.actionItems.map((item, idx) => (
              <div 
                key={idx} 
                className="p-3 border rounded-md space-y-2"
                data-testid={`card-action-item-${idx}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium" data-testid={`text-action-title-${idx}`}>
                        {item.title}
                      </h4>
                      <Badge 
                        variant={item.priority === "high" ? "destructive" : item.priority === "medium" ? "default" : "secondary"}
                        className="text-xs"
                        data-testid={`badge-priority-${idx}`}
                      >
                        {item.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1" data-testid={`text-action-desc-${idx}`}>
                      {item.description}
                    </p>
                    {item.relatedThemes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.relatedThemes.map((themeId, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {getThemeName(themeId)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {item.suggestedContent && (
                      <div className="mt-2 p-2 bg-muted/30 rounded text-sm">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Content</p>
                        <p data-testid={`text-suggested-content-${idx}`}>{item.suggestedContent}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {contextualRecommendations.curatedVerbatims.length > 0 && (
        <Card data-testid="card-curated-verbatims">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareQuote className="w-5 h-5 text-blue-500" />
              Curated Quotes for Your Use
            </CardTitle>
            <CardDescription>
              Selected verbatims ready to use in your {contextInfo.label.toLowerCase()} materials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {contextualRecommendations.curatedVerbatims.map((verbatim, idx) => (
              <div 
                key={idx} 
                className="p-3 border rounded-md bg-muted/30"
                data-testid={`card-verbatim-${idx}`}
              >
                <p className="text-sm italic" data-testid={`text-verbatim-quote-${idx}`}>
                  "{verbatim.quote}"
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{verbatim.theme}</Badge>
                  <span data-testid={`text-usage-note-${idx}`}>{verbatim.usageNote}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ProjectAnalyticsView({ projectId, projectName }: ProjectAnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showCascadeDialog, setShowCascadeDialog] = useState(false);

  const { data, isLoading } = useQuery<ProjectAnalyticsResponse>({
    queryKey: ["/api/projects", projectId, "analytics"],
    enabled: !!projectId,
  });

  const handleRefreshSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/projects", projectId, "analytics"],
    });
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
    <div className="space-y-6" data-testid="container-project-analytics">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold" data-testid="heading-project-analytics">Project Analytics</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-project-name">{projectName}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {data?.isStale && (
            <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600/30" data-testid="badge-stale">
              <AlertTriangle className="w-3 h-3" />
              Out of date
            </Badge>
          )}
          {data?.missingAnalytics !== undefined && data.missingAnalytics > 0 && (
            <Badge variant="outline" className="gap-1" data-testid="badge-missing-analytics">
              <AlertTriangle className="w-3 h-3" />
              {data.missingAnalytics} template{data.missingAnalytics === 1 ? '' : 's'} need analytics
            </Badge>
          )}
          {data?.currentTemplateCount === 0 && data?.totalTemplateCount > 0 && (
            <Badge variant="outline" className="gap-1 text-muted-foreground" data-testid="badge-no-data">
              No template analytics available yet
            </Badge>
          )}
          {data?.lastAnalyzedAt && (
            <span className="text-xs text-muted-foreground" data-testid="text-last-updated">
              Last updated: {new Date(data.lastAnalyzedAt).toLocaleDateString()}
            </span>
          )}
          {hasData && analytics && (
            <AnalyticsPdfExport
              data={{
                level: "project",
                name: projectName,
                analytics: analytics,
                lastAnalyzedAt: data?.lastAnalyzedAt || undefined,
                templateNameMap: analytics.templatePerformance?.reduce((acc, t) => {
                  acc[t.templateId] = t.templateName;
                  return acc;
                }, {} as Record<string, string>) || {},
              }}
              disabled={false}
            />
          )}
          <Button
            onClick={() => setShowCascadeDialog(true)}
            disabled={data?.currentTemplateCount === 0 && data?.totalTemplateCount === 0}
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
        level="project"
        entityId={projectId}
        entityName={projectName}
        onSuccess={handleRefreshSuccess}
      />

      {!hasData ? (
        <Card data-testid="card-no-analytics">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Analytics Available</h3>
            <p className="text-muted-foreground mb-4">
              {data?.currentTemplateCount === 0
                ? "No templates with analytics yet. Please refresh analytics for at least one template first."
                : "Click the Refresh Analytics button to generate project-level insights."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-list" className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            {analytics.contextualRecommendations && (
              <TabsTrigger value="contextual" data-testid="tab-contextual" className="gap-1">
                <Sparkles className="w-3 h-3" />
                Tailored
              </TabsTrigger>
            )}
            <TabsTrigger value="templates" data-testid="tab-templates">Templates ({analytics.templatePerformance.length})</TabsTrigger>
            <TabsTrigger value="themes" data-testid="tab-themes">Cross-Template Themes ({analytics.crossTemplateThemes.length})</TabsTrigger>
            <TabsTrigger value="insights" data-testid="tab-insights">Strategic Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6" data-testid="content-overview">
            <ExecutiveSummaryCard summary={analytics.executiveSummary} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-stat-templates">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold" data-testid="text-total-templates">{analytics.projectMetrics.totalTemplates}</p>
                      <p className="text-sm text-muted-foreground">Templates</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-collections">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Layers className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold" data-testid="text-total-collections">{analytics.projectMetrics.totalCollections}</p>
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
                      <p className="text-2xl font-bold" data-testid="text-total-sessions">{analytics.projectMetrics.totalSessions}</p>
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
                      <p className="text-2xl font-bold" data-testid="text-avg-quality">{analytics.projectMetrics.avgQualityScore}%</p>
                      <p className="text-sm text-muted-foreground">Avg Quality</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {analytics.recommendations.length > 0 && (
              <RecommendationsPanel recommendations={analytics.recommendations} />
            )}
          </TabsContent>

          {analytics.contextualRecommendations && (
            <TabsContent value="contextual" className="mt-6" data-testid="content-contextual">
              <ContextualRecommendationsCard contextualRecommendations={analytics.contextualRecommendations} crossTemplateThemes={analytics.crossTemplateThemes} />
            </TabsContent>
          )}

          <TabsContent value="templates" className="space-y-4 mt-6" data-testid="content-templates">
            <CardDescription>Compare performance across different interview templates in this project.</CardDescription>
            {analytics.templatePerformance.map((template) => (
              <TemplateComparisonCard key={template.templateId} template={template} />
            ))}
            {analytics.templatePerformance.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No templates with analytics data available.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="themes" className="space-y-4 mt-6" data-testid="content-themes">
            <CardDescription>Themes that appear across multiple interview templates, revealing cross-cutting patterns.</CardDescription>
            {analytics.crossTemplateThemes.map((theme, idx) => (
              <CrossTemplateThemeCard key={theme.id} theme={theme} index={idx} />
            ))}
            {analytics.crossTemplateThemes.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No cross-template themes detected yet. More data across templates is needed.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-4 mt-6" data-testid="content-insights">
            <CardDescription>Strategic insights derived from analyzing patterns across all templates.</CardDescription>
            {analytics.strategicInsights.map((insight, idx) => (
              <StrategicInsightCard key={idx} insight={insight} index={idx} />
            ))}
            {analytics.strategicInsights.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No strategic insights available. More data is needed for AI-powered analysis.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
