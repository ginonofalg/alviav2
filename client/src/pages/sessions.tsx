import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { 
  Search, 
  Users,
  Clock,
  CheckCircle2,
  Pause,
  AlertCircle,
  Calendar,
  ArrowRight,
  User,
  ArrowUpDown,
  FolderOpen
} from "lucide-react";
import { useState, useMemo } from "react";
import type { InterviewSession } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface EnrichedSession extends InterviewSession {
  collectionName: string;
  templateName: string;
  projectName: string;
  respondentName: string | null;
}

type SortOption = "newest_started" | "oldest_started" | "recently_completed" | "oldest_completed";

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  in_progress: { icon: Clock, color: "text-blue-500", label: "In Progress" },
  paused: { icon: Pause, color: "text-yellow-500", label: "Paused" },
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  abandoned: { icon: AlertCircle, color: "text-destructive", label: "Abandoned" },
  consent_given: { icon: CheckCircle2, color: "text-muted-foreground", label: "Consent Given" },
};

function SessionCard({ session }: { session: EnrichedSession }) {
  const status = statusConfig[session.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const duration = session.totalDurationMs 
    ? Math.round(session.totalDurationMs / 60000)
    : null;

  const startedAt = session.startedAt 
    ? formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })
    : null;

  return (
    <Link href={`/sessions/${session.id}`}>
      <Card 
        className="hover-elevate cursor-pointer transition-all duration-200 group"
        data-testid={`card-session-${session.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-1.5 h-full min-h-[80px] rounded-full ${
                session.status === "completed" ? "bg-green-500" :
                session.status === "in_progress" ? "bg-blue-500" :
                session.status === "paused" ? "bg-yellow-500" :
                "bg-muted"
              }`} />
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium truncate" data-testid="text-session-collection">
                    {session.collectionName}
                  </h4>
                  <Badge variant="outline" className={`gap-1 ${status.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-session-breadcrumb">
                  <FolderOpen className="w-3 h-3" />
                  {session.projectName} &rarr; {session.templateName}
                </p>
                {session.respondentName && (
                  <p className="text-sm flex items-center gap-1" data-testid="text-session-respondent">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    {session.respondentName}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground pt-1">
                  {duration !== null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {duration} min
                    </span>
                  )}
                  {startedAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Started {startedAt}
                    </span>
                  )}
                </div>
                {session.satisfactionRating && (
                  <div className="flex items-center gap-1 pt-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < session.satisfactionRating! ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">
                      Satisfaction
                    </span>
                  </div>
                )}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SessionCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-1.5 h-20" />
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SessionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest_started");

  const { data: sessions, isLoading } = useQuery<EnrichedSession[]>({
    queryKey: ["/api/sessions"],
  });

  const filteredAndSortedSessions = useMemo(() => {
    if (!sessions) return [];

    const query = searchQuery.toLowerCase();
    
    const filtered = sessions.filter(session => {
      const matchesSearch = 
        session.collectionName.toLowerCase().includes(query) ||
        session.templateName.toLowerCase().includes(query) ||
        session.projectName.toLowerCase().includes(query) ||
        (session.respondentName?.toLowerCase().includes(query) ?? false) ||
        session.id.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || session.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "newest_started":
          return new Date(b.startedAt || b.createdAt || 0).getTime() - new Date(a.startedAt || a.createdAt || 0).getTime();
        case "oldest_started":
          return new Date(a.startedAt || a.createdAt || 0).getTime() - new Date(b.startedAt || b.createdAt || 0).getTime();
        case "recently_completed":
          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return 1;
          if (!b.completedAt) return -1;
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        case "oldest_completed":
          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return 1;
          if (!b.completedAt) return -1;
          return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
        default:
          return 0;
      }
    });

    return sorted;
  }, [sessions, searchQuery, statusFilter, sortOption]);

  const completedCount = sessions?.filter(s => s.status === "completed").length || 0;
  const inProgressCount = sessions?.filter(s => s.status === "in_progress").length || 0;

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mt-1">
          View and manage interview sessions
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{sessions?.length || 0}</p>
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
              <p className="text-2xl font-semibold">{completedCount}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{inProgressCount}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by collection, project, template, or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-sessions"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
          <SelectTrigger className="w-48" data-testid="select-sort">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest_started">Newest started</SelectItem>
            <SelectItem value="oldest_started">Oldest started</SelectItem>
            <SelectItem value="recently_completed">Recently completed</SelectItem>
            <SelectItem value="oldest_completed">Oldest completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SessionCardSkeleton />
          <SessionCardSkeleton />
          <SessionCardSkeleton />
          <SessionCardSkeleton />
        </div>
      ) : filteredAndSortedSessions.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredAndSortedSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <Card className="py-16">
          <CardContent className="text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery || statusFilter !== "all" ? "No sessions found" : "No sessions yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filter"
                : "Sessions will appear here once respondents start their interviews"
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
