import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronRight,
  Quote,
  Target,
  Sparkles,
  FolderKanban,
  Users,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowRight,
  FileText,
  Play,
  ThumbsUp,
  GitFork
} from "lucide-react";
import type { 
  AggregatedAnalytics, 
  ProjectSummaryWithAnalytics,
  AggregatedStrategicInsight,
  AggregatedKeyFinding,
  AggregatedCrossTemplateTheme,
  AggregatedContextualRecommendation,
  AggregatedConsensusPoint,
  AggregatedDivergencePoint,
  TemplateStaleness,
  CollectionStaleness,
  StalenessStatus
} from "@shared/schema";

function StalenessBadge({ status, className }: { status: StalenessStatus; className?: string }) {
  const config: Record<StalenessStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    fresh: { label: "Fresh", variant: "default" },
    aging: { label: "Aging", variant: "secondary" },
    stale: { label: "Stale", variant: "destructive" },
    none: { label: "No Analytics", variant: "outline" },
  };
  
  const { label, variant } = config[status];
  return <Badge variant={variant} className={className} data-testid={`badge-staleness-${status}`}>{label}</Badge>;
}

function SentimentBar({ distribution }: { distribution: { positive: number; neutral: number; negative: number } | null }) {
  if (!distribution) return <span className="text-muted-foreground text-xs">No data</span>;
  
  const total = distribution.positive + distribution.neutral + distribution.negative;
  if (total === 0) return <span className="text-muted-foreground text-xs">No data</span>;
  
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted" data-testid="chart-sentiment-bar">
      <div 
        className="bg-green-500" 
        style={{ width: `${(distribution.positive / total) * 100}%` }}
        title={`Positive: ${distribution.positive}%`}
      />
      <div 
        className="bg-gray-400" 
        style={{ width: `${(distribution.neutral / total) * 100}%` }}
        title={`Neutral: ${distribution.neutral}%`}
      />
      <div 
        className="bg-red-500" 
        style={{ width: `${(distribution.negative / total) * 100}%` }}
        title={`Negative: ${distribution.negative}%`}
      />
    </div>
  );
}

function ExecutiveSummarySection({ projects }: { projects: ProjectSummaryWithAnalytics[] }) {
  const projectsWithSummaries = projects.filter(p => p.executiveSummary?.headline);
  
  if (projectsWithSummaries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Executive Insights
          </CardTitle>
          <CardDescription>Key takeaways from your research projects</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No executive summaries available yet</p>
            <p className="text-xs mt-1">Generate project-level analytics to see insights here</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Executive Insights
        </CardTitle>
        <CardDescription>Key takeaways from your research projects</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {projectsWithSummaries.slice(0, 3).map((project) => (
          <div key={project.id} className="space-y-2 p-3 rounded-lg bg-muted/30" data-testid={`card-executive-summary-${project.id}`}>
            <div className="flex items-center justify-between gap-2">
              <Link href={`/projects/${project.id}`}>
                <span className="text-sm font-medium text-primary hover:underline cursor-pointer flex items-center gap-1">
                  <FolderKanban className="w-3.5 h-3.5" />
                  {project.name}
                </span>
              </Link>
              <StalenessBadge status={project.stalenessStatus} />
            </div>
            <p className="font-semibold text-foreground" data-testid="text-headline">
              {project.executiveSummary?.headline}
            </p>
            {project.executiveSummary?.keyTakeaways && project.executiveSummary.keyTakeaways.length > 0 && (
              <ul className="space-y-1 ml-4">
                {project.executiveSummary.keyTakeaways.slice(0, 3).map((takeaway, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground list-disc">
                    {takeaway}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {projectsWithSummaries.length > 3 && (
          <p className="text-xs text-muted-foreground text-center">
            +{projectsWithSummaries.length - 3} more projects with summaries
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StrategicThemesSection({ themes }: { themes: AggregatedCrossTemplateTheme[] }) {
  if (themes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Strategic Themes
          </CardTitle>
          <CardDescription>Cross-template themes identified as strategic priorities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No strategic themes identified yet</p>
            <p className="text-xs mt-1">Complete more interviews to discover patterns</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Strategic Themes
        </CardTitle>
        <CardDescription>High-impact themes across multiple interview types</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {themes.map((theme, idx) => (
          <div key={theme.id || idx} className="p-3 rounded-lg hover-elevate" data-testid={`card-strategic-theme-${idx}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{theme.theme}</span>
                  <Badge variant="outline" className="text-xs">
                    {theme.totalMentions} mentions
                  </Badge>
                  {theme.isStrategic && (
                    <Badge variant="default" className="text-xs">
                      <Zap className="w-3 h-3 mr-1" />
                      Strategic
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {theme.description}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span>From: {theme.sourceProjectName}</span>
                  <span>•</span>
                  <span>{theme.templatesAppeared?.length || 0} templates</span>
                </div>
              </div>
            </div>
            {theme.verbatims && theme.verbatims.length > 0 && (
              <div className="mt-2 pl-3 border-l-2 border-primary/20">
                <p className="text-sm italic text-muted-foreground">
                  "{theme.verbatims[0].quote}"
                </p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InsightsFeedSection({ 
  insights, 
  findings,
  consensusPoints,
  divergencePoints
}: { 
  insights: AggregatedStrategicInsight[]; 
  findings: AggregatedKeyFinding[];
  consensusPoints: AggregatedConsensusPoint[];
  divergencePoints: AggregatedDivergencePoint[];
}) {
  const allInsights = [
    ...insights.map(i => ({ type: "strategic" as const, data: i })),
    ...findings.map(f => ({ type: "finding" as const, data: f })),
    ...consensusPoints.map(c => ({ type: "consensus" as const, data: c })),
    ...divergencePoints.map(d => ({ type: "divergence" as const, data: d })),
  ].slice(0, 15);
  
  if (allInsights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            Insights Feed
          </CardTitle>
          <CardDescription>Latest findings and strategic insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No insights discovered yet</p>
            <p className="text-xs mt-1">Generate analytics to see findings here</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          Insights Feed
        </CardTitle>
        <CardDescription>Latest findings and strategic insights from your research</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {allInsights.map((item, idx) => (
          <div key={idx} className="p-3 rounded-lg hover-elevate border border-transparent hover:border-border" data-testid={`card-insight-${idx}`}>
            {item.type === "strategic" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="default" className="text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Strategic
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.data.sourceProjectName}
                  </span>
                </div>
                <p className="font-medium text-sm">{item.data.insight}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.data.significance}</p>
              </>
            )}
            {item.type === "finding" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Finding
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.data.sourceProjectName}
                    {item.data.sourceTemplateName && ` > ${item.data.sourceTemplateName}`}
                  </span>
                </div>
                <p className="font-medium text-sm">{item.data.finding}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.data.significance}</p>
                {item.data.supportingVerbatims && item.data.supportingVerbatims.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-secondary/50">
                    <p className="text-xs italic text-muted-foreground">
                      "{item.data.supportingVerbatims[0].quote}"
                    </p>
                  </div>
                )}
              </>
            )}
            {item.type === "consensus" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    <ThumbsUp className="w-3 h-3 mr-1" />
                    Consensus
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.data.sourceProjectName}
                    {item.data.sourceTemplateName && ` > ${item.data.sourceTemplateName}`}
                  </span>
                </div>
                <p className="font-medium text-sm">{item.data.topic}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.data.position}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {item.data.agreementLevel}% agreement
                  </span>
                </div>
                {item.data.verbatims && item.data.verbatims.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-green-200 dark:border-green-800">
                    <p className="text-xs italic text-muted-foreground">
                      "{item.data.verbatims[0].quote}"
                    </p>
                  </div>
                )}
              </>
            )}
            {item.type === "divergence" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    <GitFork className="w-3 h-3 mr-1" />
                    Divergence
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.data.sourceProjectName}
                    {item.data.sourceTemplateName && ` > ${item.data.sourceTemplateName}`}
                  </span>
                </div>
                <p className="font-medium text-sm">{item.data.topic}</p>
                {item.data.perspectives && item.data.perspectives.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {item.data.perspectives.slice(0, 2).map((p, pIdx) => (
                      <div key={pIdx} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-amber-600 dark:text-amber-400">{p.count}x</span>
                        <span>"{p.position}"</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ResearchHealthSection({ 
  projects, 
  overallMetrics,
  healthIndicators,
  templateStaleness,
  collectionStaleness
}: { 
  projects: ProjectSummaryWithAnalytics[];
  overallMetrics: AggregatedAnalytics["overallMetrics"];
  healthIndicators: AggregatedAnalytics["healthIndicators"];
  templateStaleness: TemplateStaleness[];
  collectionStaleness: CollectionStaleness[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-stat-projects">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
              <FolderKanban className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{overallMetrics.totalProjects}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overallMetrics.totalTemplates} templates, {overallMetrics.totalCollections} collections
            </p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-stat-sessions">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{overallMetrics.totalSessions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overallMetrics.completedSessions} completed
            </p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-stat-quality">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Quality</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {overallMetrics.avgQualityScore ? `${Math.round(overallMetrics.avgQualityScore)}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all projects
            </p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-stat-health">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Analytics Health</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-950/30 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {healthIndicators.projectsWithNoAnalytics + healthIndicators.projectsWithStaleAnalytics + (healthIndicators.templatesNeedingRefresh || 0) + healthIndicators.collectionsNeedingRefresh}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {healthIndicators.projectsWithNoAnalytics + healthIndicators.projectsWithStaleAnalytics}P / {healthIndicators.templatesNeedingRefresh || 0}T / {healthIndicators.collectionsNeedingRefresh}C
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Project Health
          </CardTitle>
          <CardDescription>Analytics freshness and session activity by project</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No projects yet</p>
              <p className="text-xs mt-1">Create a project to start your research</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div 
                  key={project.id} 
                  className="flex items-center gap-4 p-3 rounded-lg hover-elevate"
                  data-testid={`card-project-health-${project.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/projects/${project.id}`}>
                        <span className="font-medium hover:underline cursor-pointer">
                          {project.name}
                        </span>
                      </Link>
                      <StalenessBadge status={project.stalenessStatus} />
                      {project.newSessionsSinceRefresh > 0 && (
                        <Badge variant="outline" className="text-xs">
                          +{project.newSessionsSinceRefresh} new
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{project.templateCount} templates</span>
                      <span>{project.collectionCount} collections</span>
                      <span>{project.completedSessions}/{project.totalSessions} sessions</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {project.lastRefreshLabel}
                      </span>
                    </div>
                  </div>
                  <div className="w-24">
                    <SentimentBar distribution={project.sentimentDistribution} />
                  </div>
                  <Link href={`/projects/${project.id}`}>
                    <Button variant="ghost" size="icon" data-testid={`button-view-project-${project.id}`}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {(templateStaleness.length > 0 || collectionStaleness.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {templateStaleness.length > 0 && (
            <Card data-testid="card-template-staleness">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-500" />
                  Templates Needing Refresh
                </CardTitle>
                <CardDescription className="text-xs">Templates with stale or missing analytics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {templateStaleness.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover-elevate" data-testid={`row-template-stale-${t.id}`}>
                    <div className="flex-1 min-w-0">
                      <Link href={`/templates/${t.id}`}>
                        <span className="text-sm font-medium hover:underline cursor-pointer">{t.name}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground">{t.sourceProjectName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StalenessBadge status={t.stalenessStatus} />
                      <Link href={`/templates/${t.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-view-template-${t.id}`}>
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
                {templateStaleness.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{templateStaleness.length - 5} more templates need attention
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          
          {collectionStaleness.length > 0 && (
            <Card data-testid="card-collection-staleness">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="w-4 h-4 text-green-500" />
                  Collections Needing Refresh
                </CardTitle>
                <CardDescription className="text-xs">Collections with stale or missing analytics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {collectionStaleness.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover-elevate" data-testid={`row-collection-stale-${c.id}`}>
                    <div className="flex-1 min-w-0">
                      <Link href={`/collections/${c.id}`}>
                        <span className="text-sm font-medium hover:underline cursor-pointer">{c.name}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.sourceProjectName} &gt; {c.sourceTemplateName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{c.sessionCount} sessions</Badge>
                      <StalenessBadge status={c.stalenessStatus} />
                      <Link href={`/collections/${c.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-view-collection-${c.id}`}>
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
                {collectionStaleness.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{collectionStaleness.length - 5} more collections need attention
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ContextualRecommendationsSection({ recommendations }: { recommendations: AggregatedContextualRecommendation[] }) {
  if (recommendations.length === 0) {
    return null;
  }
  
  const contextTypeLabels: Record<string, string> = {
    content: "Content Strategy",
    product: "Product Development",
    marketing: "Marketing & Positioning",
    cx: "Customer Experience",
    other: "Other",
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Tailored Recommendations
        </CardTitle>
        <CardDescription>Action items based on your strategic context</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendations.map((rec) => (
          <div key={rec.projectId} className="space-y-3" data-testid={`card-contextual-rec-${rec.projectId}`}>
            <div className="flex items-center gap-2">
              <Link href={`/projects/${rec.projectId}`}>
                <span className="font-medium text-primary hover:underline cursor-pointer">
                  {rec.projectName}
                </span>
              </Link>
              <Badge variant="outline" className="text-xs">
                {contextTypeLabels[rec.contextType] || rec.contextType}
              </Badge>
            </div>
            
            {rec.strategicSummary && (
              <p className="text-sm text-muted-foreground">{rec.strategicSummary}</p>
            )}
            
            {rec.actionItems && rec.actionItems.length > 0 && (
              <div className="space-y-2">
                {rec.actionItems.filter(a => a.priority === "high").slice(0, 3).map((action, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                    <Badge variant="destructive" className="text-xs shrink-0">High</Badge>
                    <div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {rec.curatedVerbatims && rec.curatedVerbatims.length > 0 && (
              <div className="pl-3 border-l-2 border-primary/20">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Quote className="w-3 h-3" />
                  Curated Quote
                </div>
                <p className="text-sm italic">"{rec.curatedVerbatims[0].quote}"</p>
                <p className="text-xs text-muted-foreground mt-1">{rec.curatedVerbatims[0].usageNote}</p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-60 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-60 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: analytics, isLoading, refetch } = useQuery<AggregatedAnalytics>({
    queryKey: ["/api/analytics/aggregated"],
  });

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="heading-analytics-title">
            Analytics Command Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Insights and patterns across all your research
          </p>
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh-analytics"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : !analytics ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Unable to load analytics</p>
              <p className="text-sm mt-1">Please try refreshing the page</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList data-testid="tabs-analytics" className="w-max sm:w-auto">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
              <TabsTrigger value="health" data-testid="tab-health">Research Health</TabsTrigger>
              {analytics.contextualRecommendations.length > 0 && (
                <TabsTrigger value="tailored" data-testid="tab-tailored">Tailored</TabsTrigger>
              )}
            </TabsList>
          </div>
          
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card data-testid="card-stat-projects-overview">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                    <FolderKanban className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{analytics.overallMetrics.totalProjects}</div>
                </CardContent>
              </Card>
              
              <Card data-testid="card-stat-sessions-overview">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{analytics.overallMetrics.totalSessions}</div>
                </CardContent>
              </Card>
              
              <Card data-testid="card-stat-quality-overview">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Quality</CardTitle>
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
                    {analytics.overallMetrics.avgQualityScore 
                      ? `${Math.round(analytics.overallMetrics.avgQualityScore)}%` 
                      : "—"}
                  </div>
                </CardContent>
              </Card>
              
              <Card data-testid="card-stat-needing-refresh">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Need Refresh</CardTitle>
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-950/30 flex items-center justify-center">
                    <RefreshCw className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
                    {analytics.healthIndicators.projectsWithStaleAnalytics + analytics.healthIndicators.projectsWithNoAnalytics}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid gap-6 lg:grid-cols-2">
              <ExecutiveSummarySection projects={analytics.projects} />
              <StrategicThemesSection themes={analytics.strategicThemes} />
            </div>
            
            {analytics.projects.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Quick Navigation</CardTitle>
                    <CardDescription>Jump to your research projects</CardDescription>
                  </div>
                  <Link href="/projects">
                    <Button variant="ghost" size="sm" data-testid="button-view-all-projects">
                      View All
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {analytics.projects.slice(0, 6).map((project) => (
                      <Link key={project.id} href={`/projects/${project.id}`}>
                        <div 
                          className="p-3 rounded-lg hover-elevate border border-transparent hover:border-border cursor-pointer"
                          data-testid={`card-quick-nav-${project.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate">{project.name}</span>
                            <StalenessBadge status={project.stalenessStatus} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {project.completedSessions} sessions completed
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="insights" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <InsightsFeedSection 
                insights={analytics.strategicInsights} 
                findings={analytics.keyFindings}
                consensusPoints={analytics.consensusPoints || []}
                divergencePoints={analytics.divergencePoints || []}
              />
              <StrategicThemesSection themes={analytics.strategicThemes} />
            </div>
          </TabsContent>
          
          <TabsContent value="health" className="space-y-6">
            <ResearchHealthSection 
              projects={analytics.projects}
              overallMetrics={analytics.overallMetrics}
              healthIndicators={analytics.healthIndicators}
              templateStaleness={analytics.templateStaleness || []}
              collectionStaleness={analytics.collectionStaleness || []}
            />
          </TabsContent>
          
          {analytics.contextualRecommendations.length > 0 && (
            <TabsContent value="tailored" className="space-y-6">
              <ContextualRecommendationsSection 
                recommendations={analytics.contextualRecommendations} 
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
