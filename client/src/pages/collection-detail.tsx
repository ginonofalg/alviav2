import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Copy, 
  ExternalLink,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Lightbulb,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ThemeCard, InsightPanel, RecommendationsPanel, QuestionAnalysis } from "@/components/analytics";
import type { Collection, InterviewTemplate, Project, SessionWithRespondent, CollectionAnalytics, QualityFlag } from "@shared/schema";

interface CollectionWithDetails extends Collection {
  template?: InterviewTemplate;
  project?: Project;
}

interface AnalyticsResponse {
  analytics: CollectionAnalytics | null;
  lastAnalyzedAt: string | null;
  analyzedSessionCount: number;
  currentSessionCount: number;
  isStale: boolean;
}

const QUALITY_FLAG_LABELS: Record<QualityFlag, { label: string; color: string }> = {
  incomplete: { label: "Incomplete", color: "text-yellow-600" },
  ambiguous: { label: "Ambiguous", color: "text-orange-500" },
  contradiction: { label: "Contradiction", color: "text-red-500" },
  distress_cue: { label: "Distress Cue", color: "text-purple-500" },
  off_topic: { label: "Off Topic", color: "text-blue-500" },
  low_engagement: { label: "Low Engagement", color: "text-gray-500" },
};

export default function CollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const collectionId = params.id;
  const { toast } = useToast();

  const { data: collection, isLoading } = useQuery<CollectionWithDetails>({
    queryKey: ["/api/collections", collectionId],
    enabled: !!collectionId,
  });

  const { data: sessions } = useQuery<SessionWithRespondent[]>({
    queryKey: ["/api/collections", collectionId, "sessions"],
    enabled: !!collectionId,
  });

  const { data: analyticsData, isLoading: isLoadingAnalytics } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/collections", collectionId, "analytics"],
    enabled: !!collectionId,
  });

  const refreshAnalyticsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST", 
        `/api/collections/${collectionId}/analytics/refresh`,
        undefined,
        { timeoutMs: 120000 }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections", collectionId, "analytics"] });
      toast({
        title: "Analysis complete",
        description: "Analytics have been refreshed with the latest data.",
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

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/join/${collectionId}`;
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied",
      description: "Share this link with your respondents.",
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Collection not found</h3>
            <p className="text-muted-foreground mb-4">
              The collection you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/collections">
              <Button>Back to Collections</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedSessions = sessions?.filter(s => s.status === "completed").length || 0;
  const inProgressSessions = sessions?.filter(s => s.status === "in_progress").length || 0;
  const totalSessions = sessions?.length || 0;
  const progress = collection.targetResponses 
    ? Math.min(100, Math.round((completedSessions / collection.targetResponses) * 100))
    : 0;

  const shareUrl = `${window.location.origin}/join/${collectionId}`;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/collections">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
              {collection.isActive ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Open
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  Closed
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {collection.template?.name || "Interview Template"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyShareLink} data-testid="button-copy-link">
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </Button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" data-testid="button-preview">
              <ExternalLink className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalSessions}</p>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{completedSessions}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{inProgressSessions}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{progress}%</p>
              <p className="text-sm text-muted-foreground">Progress</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Share Link</CardTitle>
          <CardDescription>
            Share this link with respondents to collect interviews
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm truncate">
              {shareUrl}
            </div>
            <Button variant="outline" onClick={copyShareLink} data-testid="button-copy-share-link">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>
                Interview sessions from this collection
              </CardDescription>
            </div>
            {totalSessions > 0 && (
              <Link href={`/sessions?collectionId=${collectionId}`}>
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!sessions || sessions.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium mb-2">No sessions yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share the collection link to start collecting responses.
              </p>
              <Button onClick={copyShareLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Share Link
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((session) => {
                const displayName = session.respondent?.informalName || session.respondent?.fullName || "Anonymous";
                return (
                  <Link key={session.id} href={`/sessions/${session.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`session-row-${session.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm" data-testid={`session-name-${session.id}`}>{displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {session.createdAt ? new Date(session.createdAt).toLocaleDateString() : ""}
                          </p>
                        </div>
                      </div>
                      <Badge variant={session.status === "completed" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 flex-wrap" data-testid="heading-analytics">
                <BarChart3 className="w-5 h-5 text-primary" />
                Analytics
              </CardTitle>
              <CardDescription data-testid="text-analytics-description">
                Cross-interview insights and quality analysis
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {analyticsData?.isStale && (
                <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600/30">
                  <AlertTriangle className="w-3 h-3" />
                  Out of date
                </Badge>
              )}
              {analyticsData?.lastAnalyzedAt && (
                <span className="text-xs text-muted-foreground" data-testid="text-analytics-last-updated">
                  Last updated: {new Date(analyticsData.lastAnalyzedAt).toLocaleDateString()}
                </span>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refreshAnalyticsMutation.mutate()}
                disabled={refreshAnalyticsMutation.isPending || completedSessions === 0}
                data-testid="button-refresh-analytics"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshAnalyticsMutation.isPending ? "animate-spin" : ""}`} />
                {refreshAnalyticsMutation.isPending ? "Analyzing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingAnalytics ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !analyticsData?.analytics ? (
            <div className="text-center py-8" data-testid="empty-analytics">
              <BarChart3 className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium mb-2" data-testid="text-no-analysis-heading">No analysis yet</h3>
              <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-analysis-message">
                {completedSessions === 0 
                  ? "Complete some interviews to generate analytics."
                  : "Click Refresh to analyze your completed interviews."}
              </p>
              {completedSessions > 0 && (
                <Button 
                  onClick={() => refreshAnalyticsMutation.mutate()}
                  disabled={refreshAnalyticsMutation.isPending}
                  data-testid="button-run-first-analysis"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Run Analysis
                </Button>
              )}
            </div>
          ) : (
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="summary" className="gap-2" data-testid="tab-summary">
                  <Lightbulb className="w-4 h-4" />
                  Summary
                </TabsTrigger>
                <TabsTrigger value="details" className="gap-2" data-testid="tab-details">
                  <FileText className="w-4 h-4" />
                  Details
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="summary" className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="p-4 rounded-lg bg-muted/50" data-testid="metric-sessions">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Sessions</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-sessions-value">{analyticsData.analytics.overallStats.totalCompletedSessions}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50" data-testid="metric-duration">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg Duration</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-duration-value">{analyticsData.analytics.overallStats.avgSessionDuration} min</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50" data-testid="metric-quality">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg Quality</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-quality-value">{analyticsData.analytics.overallStats.avgQualityScore}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50" data-testid="metric-themes">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Themes</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-themes-value">{analyticsData.analytics.themes.length}</p>
                  </div>
                </div>

                <InsightPanel 
                  keyFindings={analyticsData.analytics.keyFindings || []}
                  consensusPoints={analyticsData.analytics.consensusPoints || []}
                  divergencePoints={analyticsData.analytics.divergencePoints || []}
                  themes={analyticsData.analytics.themes || []}
                />

                {analyticsData.analytics.recommendations && analyticsData.analytics.recommendations.length > 0 && (
                  <RecommendationsPanel recommendations={analyticsData.analytics.recommendations} />
                )}

                {analyticsData.analytics.overallStats.commonQualityIssues.length > 0 && (
                  <div data-testid="section-quality-issues">
                    <h4 className="font-medium mb-3 flex items-center gap-2 flex-wrap" data-testid="heading-quality-issues">
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      Quality Issues
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {analyticsData.analytics.overallStats.commonQualityIssues.map((issue, index) => (
                        <Badge key={index} variant="outline" className={`gap-1 ${QUALITY_FLAG_LABELS[issue.flag]?.color || ""}`} data-testid={`badge-quality-issue-${index}`}>
                          {QUALITY_FLAG_LABELS[issue.flag]?.label || issue.flag}
                          <span className="text-muted-foreground">({issue.count})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="details" className="space-y-6">
                {analyticsData.analytics.themes.length > 0 && (
                  <div data-testid="section-themes">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-wrap" data-testid="heading-themes">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Themes
                    </h3>
                    <div className="space-y-3">
                      {analyticsData.analytics.themes.map((theme) => (
                        <ThemeCard key={theme.id} theme={theme} />
                      ))}
                    </div>
                  </div>
                )}

                {analyticsData.analytics.questionPerformance.length > 0 && (
                  <div data-testid="section-question-performance">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-wrap" data-testid="heading-question-performance">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      Question Performance
                    </h3>
                    <QuestionAnalysis questions={analyticsData.analytics.questionPerformance} />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
