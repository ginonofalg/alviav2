import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  FolderKanban, 
  FileText, 
  Users, 
  TrendingUp, 
  Plus, 
  ArrowRight,
  Clock,
  CheckCircle2,
  Pause
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Project, Collection, InterviewSession } from "@shared/schema";

interface DashboardStats {
  projectCount: number;
  collectionCount: number;
  sessionCount: number;
  completedSessions: number;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  isLoading 
}: { 
  title: string; 
  value: number | string; 
  icon: React.ElementType;
  trend?: string;
  isLoading?: boolean;
}) {
  return (
    <Card className="hover-elevate transition-all duration-200">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{value}</span>
            {trend && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-500" />
                {trend}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover-elevate cursor-pointer transition-all duration-200" data-testid={`card-project-${project.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h4 className="font-medium truncate">{project.name}</h4>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description || "No description"}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "outline"; icon: React.ElementType }> = {
    completed: { variant: "default", icon: CheckCircle2 },
    in_progress: { variant: "secondary", icon: Clock },
    paused: { variant: "outline", icon: Pause },
    pending: { variant: "outline", icon: Clock },
    abandoned: { variant: "outline", icon: Clock },
    consent_given: { variant: "outline", icon: Clock },
  };
  const { variant, icon: Icon } = config[status] || config.pending;
  
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {status.replace("_", " ")}
    </Badge>
  );
}

function RecentSessionRow({ session }: { session: InterviewSession }) {
  const duration = session.totalDurationMs 
    ? `${Math.round(session.totalDurationMs / 60000)} min` 
    : "—";

  return (
    <Link href={`/sessions/${session.id}`}>
      <div 
        className="flex items-center justify-between gap-4 p-3 rounded-lg hover-elevate cursor-pointer"
        data-testid={`row-session-${session.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-1 h-8 rounded-full ${
            session.status === "completed" ? "bg-green-500" :
            session.status === "in_progress" ? "bg-blue-500" :
            session.status === "paused" ? "bg-yellow-500" :
            "bg-muted"
          }`} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">Session #{session.id.slice(0, 8)}</p>
            <p className="text-xs text-muted-foreground">{duration}</p>
          </div>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentProjects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: recentSessions, isLoading: sessionsLoading } = useQuery<InterviewSession[]>({
    queryKey: ["/api/sessions?limit=5"],
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const firstName = user?.firstName || "there";

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your research
          </p>
        </div>
        <Link href="/projects/new">
          <Button data-testid="button-new-project-dashboard">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Projects"
          value={stats?.projectCount ?? 0}
          icon={FolderKanban}
          isLoading={statsLoading}
        />
        <StatCard
          title="Collections"
          value={stats?.collectionCount ?? 0}
          icon={FileText}
          isLoading={statsLoading}
        />
        <StatCard
          title="Total Sessions"
          value={stats?.sessionCount ?? 0}
          icon={Users}
          isLoading={statsLoading}
        />
        <StatCard
          title="Completed"
          value={stats?.completedSessions ?? 0}
          icon={CheckCircle2}
          isLoading={statsLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">Recent Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm" data-testid="link-view-all-projects">
                View all
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectsLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : recentProjects && recentProjects.length > 0 ? (
              recentProjects.map((project) => (
                <RecentProjectCard key={project.id} project={project} />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No projects yet</p>
                <Link href="/projects/new">
                  <Button variant="link" size="sm" className="mt-2" data-testid="link-create-first-project">
                    Create your first project
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">Recent Sessions</CardTitle>
            <Link href="/sessions">
              <Button variant="ghost" size="sm" data-testid="link-view-all-sessions">
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
