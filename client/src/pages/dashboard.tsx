import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { 
  FolderKanban, 
  FileText, 
  Users, 
  Plus, 
  ArrowRight,
  Clock,
  CheckCircle2,
  Pause,
  AlertTriangle,
  Play,
  TrendingUp,
  XCircle,
  Activity,
  BarChart3
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { OnboardingDashboardCard } from "@/components/onboarding";

interface EnrichedSession {
  id: string;
  collectionId: string;
  respondentId: string;
  status: string;
  currentQuestionIndex: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  pausedAt: Date | null;
  totalDurationMs: number | null;
  createdAt: Date | null;
  collectionName: string;
  templateName: string;
  projectName: string;
  respondentName: string | null;
}

interface EnhancedDashboardStats {
  projectCount: number;
  templateCount: number;
  collectionCount: number;
  sessionCount: number;
  completedSessions: number;
  sessionsByStatus: Record<string, number>;
  avgSessionDurationMs: number;
  completionRate: number;
  activeCollections: Array<{
    id: string;
    name: string;
    projectName: string;
    targetResponses: number | null;
    actualResponses: number;
    completedResponses: number;
    isActive: boolean;
    createdAt: string | null;
  }>;
  actionItems: {
    pausedSessions: Array<{
      id: string;
      respondentName: string | null;
      collectionName: string;
      pausedAt: string | null;
      pausedDurationHours: number;
    }>;
    abandonedSessions: Array<{
      id: string;
      respondentName: string | null;
      collectionName: string;
      createdAt: string | null;
    }>;
    inProgressSessions: Array<{
      id: string;
      respondentName: string | null;
      collectionName: string;
      startedAt: string | null;
    }>;
    staleCollections: Array<{
      id: string;
      name: string;
      projectName: string;
      lastSessionAt: string | null;
      daysSinceActivity: number;
    }>;
  };
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  isLoading,
  href,
  iconBgColor = "bg-primary/10",
  iconColor = "text-primary"
}: { 
  title: string; 
  value: number | string; 
  icon: React.ElementType;
  description?: string;
  isLoading?: boolean;
  href?: string;
  iconBgColor?: string;
  iconColor?: string;
}) {
  const cardContent = (
    <Card className={`hover-elevate transition-all duration-200 ${href ? "cursor-pointer" : ""}`} data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`w-8 h-8 rounded-lg ${iconBgColor} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div>
            <span className="text-2xl font-semibold">{value}</span>
            <p className="text-xs text-muted-foreground mt-1 min-h-[1rem]">{description || "\u00A0"}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }
  return cardContent;
}

function SessionStatusBreakdown({ 
  sessionsByStatus, 
  totalSessions,
  isLoading 
}: { 
  sessionsByStatus: Record<string, number>;
  totalSessions: number;
  isLoading: boolean;
}) {
  const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    completed: { label: "Completed", color: "bg-green-500", icon: CheckCircle2 },
    in_progress: { label: "In Progress", color: "bg-blue-500", icon: Play },
    paused: { label: "Paused", color: "bg-yellow-500", icon: Pause },
    pending: { label: "Pending", color: "bg-gray-400", icon: Clock },
    consent_given: { label: "Consent Given", color: "bg-purple-500", icon: CheckCircle2 },
    abandoned: { label: "Abandoned", color: "bg-red-500", icon: XCircle },
  };

  return (
    <Card data-testid="session-status-breakdown">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Sessions by Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </>
        ) : (
          Object.entries(sessionsByStatus)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => {
              const config = statusConfig[status] || { label: status, color: "bg-gray-400", icon: Clock };
              const percentage = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
              return (
                <div key={status} className="flex items-center gap-3" data-testid={`status-row-${status}`}>
                  <div className={`w-3 h-3 rounded-full ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium truncate">{config.label}</span>
                      <span className="text-sm text-muted-foreground">{count} ({percentage}%)</span>
                    </div>
                    <Progress value={percentage} className="h-1.5" />
                  </div>
                </div>
              );
            })
        )}
        {!isLoading && totalSessions === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No sessions yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function CollectionProgressCard({ 
  collections, 
  isLoading 
}: { 
  collections: EnhancedDashboardStats["activeCollections"];
  isLoading: boolean;
}) {
  return (
    <Card data-testid="collection-progress" className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-lg truncate">Collection Progress</CardTitle>
          <CardDescription className="truncate">Active collections and their response targets</CardDescription>
        </div>
        <Link href="/collections">
          <Button variant="ghost" size="sm" className="shrink-0" data-testid="link-view-all-collections">
            View all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : collections.length > 0 ? (
          collections.map((collection) => {
            const progress = collection.targetResponses 
              ? Math.min(100, Math.round((collection.completedResponses / collection.targetResponses) * 100))
              : null;
            return (
              <Link href={`/collections/${collection.id}`} key={collection.id}>
                <div 
                  className="p-3 rounded-lg hover-elevate cursor-pointer border"
                  data-testid={`collection-progress-${collection.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm truncate">{collection.name}</h4>
                      <p className="text-xs text-muted-foreground truncate">{collection.projectName}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {collection.completedResponses} / {collection.targetResponses || "—"}
                    </Badge>
                  </div>
                  {progress !== null && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active collections</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItemsCard({ 
  actionItems, 
  isLoading 
}: { 
  actionItems: EnhancedDashboardStats["actionItems"];
  isLoading: boolean;
}) {
  const hasItems = actionItems.pausedSessions.length > 0 || 
    actionItems.inProgressSessions.length > 0 || 
    actionItems.staleCollections.length > 0;

  return (
    <Card data-testid="action-items">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Needs Attention
        </CardTitle>
        <CardDescription>Items that may require your action</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : hasItems ? (
          <>
            {actionItems.pausedSessions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Pause className="w-4 h-4 text-yellow-500" />
                  Paused Sessions ({actionItems.pausedSessions.length})
                </h4>
                {actionItems.pausedSessions.slice(0, 3).map((session) => (
                  <Link href={`/sessions/${session.id}`} key={session.id}>
                    <div 
                      className="flex items-center justify-between gap-2 p-2 rounded hover-elevate cursor-pointer text-sm"
                      data-testid={`paused-session-${session.id}`}
                    >
                      <span className="truncate">{session.respondentName || `Session #${session.id.slice(0, 8)}`}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {session.pausedDurationHours}h paused
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            
            {actionItems.inProgressSessions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-500" />
                  In Progress ({actionItems.inProgressSessions.length})
                </h4>
                {actionItems.inProgressSessions.slice(0, 3).map((session) => (
                  <Link href={`/sessions/${session.id}`} key={session.id}>
                    <div 
                      className="flex items-center justify-between gap-2 p-2 rounded hover-elevate cursor-pointer text-sm"
                      data-testid={`in-progress-session-${session.id}`}
                    >
                      <span className="truncate">{session.respondentName || `Session #${session.id.slice(0, 8)}`}</span>
                      <Badge variant="outline" className="shrink-0">{session.collectionName}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {actionItems.staleCollections.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Inactive Collections ({actionItems.staleCollections.length})
                </h4>
                {actionItems.staleCollections.slice(0, 3).map((collection) => (
                  <Link href={`/collections/${collection.id}`} key={collection.id}>
                    <div 
                      className="flex items-center justify-between gap-2 p-2 rounded hover-elevate cursor-pointer text-sm"
                      data-testid={`stale-collection-${collection.id}`}
                    >
                      <span className="truncate">{collection.name}</span>
                      <Badge variant="outline" className="shrink-0">
                        {collection.daysSinceActivity} days idle
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-70" />
            <p className="text-sm">All caught up!</p>
            <p className="text-xs mt-1">No items need your attention right now</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSessionRow({ session }: { session: EnrichedSession }) {
  const duration = session.totalDurationMs 
    ? `${Math.round(session.totalDurationMs / 60000)} min` 
    : "—";

  const statusConfig: Record<string, { variant: "default" | "secondary" | "outline"; color: string }> = {
    completed: { variant: "default", color: "bg-green-500" },
    in_progress: { variant: "secondary", color: "bg-blue-500" },
    paused: { variant: "outline", color: "bg-yellow-500" },
    pending: { variant: "outline", color: "bg-gray-400" },
    abandoned: { variant: "outline", color: "bg-red-500" },
    consent_given: { variant: "outline", color: "bg-purple-500" },
  };
  const config = statusConfig[session.status] || statusConfig.pending;

  return (
    <Link href={`/sessions/${session.id}`}>
      <div 
        className="flex items-center justify-between gap-4 p-3 rounded-lg hover-elevate cursor-pointer"
        data-testid={`row-session-${session.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-1 h-10 rounded-full ${config.color}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {session.respondentName || `Session #${session.id.slice(0, 8)}`}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {session.collectionName} • {duration}
            </p>
          </div>
        </div>
        <Badge variant={config.variant} className="shrink-0">
          {session.status.replace("_", " ")}
        </Badge>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<EnhancedDashboardStats>({
    queryKey: ["/api/dashboard/enhanced-stats"],
  });

  const { data: recentSessions, isLoading: sessionsLoading } = useQuery<EnrichedSession[]>({
    queryKey: ["/api/sessions?limit=5"],
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const firstName = user?.firstName || "there";

  const formatDuration = (ms: number) => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's an overview of your research activity
          </p>
        </div>
        <Link href="/projects/new">
          <Button data-testid="button-new-project-dashboard">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      <OnboardingDashboardCard />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Projects"
          value={stats?.projectCount ?? 0}
          icon={FolderKanban}
          isLoading={statsLoading}
          href="/projects"
          iconBgColor="bg-blue-500/10"
          iconColor="text-blue-500"
        />
        <StatCard
          title="Collections"
          value={stats?.collectionCount ?? 0}
          icon={Play}
          isLoading={statsLoading}
          href="/collections"
          iconBgColor="bg-purple-500/10"
          iconColor="text-purple-500"
        />
        <StatCard
          title="Templates"
          value={stats?.templateCount ?? 0}
          icon={FileText}
          isLoading={statsLoading}
          href="/templates"
          iconBgColor="bg-emerald-500/10"
          iconColor="text-emerald-500"
        />
        <StatCard
          title="Sessions"
          value={stats?.sessionCount ?? 0}
          icon={Users}
          isLoading={statsLoading}
          href="/sessions"
          iconBgColor="bg-blue-500/10"
          iconColor="text-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SessionStatusBreakdown 
          sessionsByStatus={stats?.sessionsByStatus ?? {}}
          totalSessions={stats?.sessionCount ?? 0}
          isLoading={statsLoading}
        />
        <ActionItemsCard 
          actionItems={stats?.actionItems ?? { pausedSessions: [], abandonedSessions: [], inProgressSessions: [], staleCollections: [] }}
          isLoading={statsLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CollectionProgressCard 
          collections={stats?.activeCollections ?? []}
          isLoading={statsLoading}
        />
        
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">Recent Sessions</CardTitle>
              <CardDescription className="truncate">Latest interview activity</CardDescription>
            </div>
            <Link href="/sessions">
              <Button variant="ghost" size="sm" className="shrink-0" data-testid="link-view-all-sessions">
                View all
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : recentSessions && recentSessions.length > 0 ? (
              <div className="space-y-1">
                {recentSessions.map((session) => (
                  <RecentSessionRow key={session.id} session={session} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No sessions yet</p>
                <p className="text-xs mt-1">Sessions will appear here once respondents start interviews</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
