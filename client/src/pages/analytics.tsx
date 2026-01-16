import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Filter
} from "lucide-react";

interface Project {
  id: string;
  name: string;
}

interface Collection {
  id: string;
  name: string;
  projectId: string;
}

interface AnalyticsData {
  totalSessions: number;
  completedSessions: number;
  averageDuration: number;
  completionRate: number;
  topThemes: { theme: string; count: number }[];
  questionStats: { questionText: string; avgConfidence: number; responseCount: number }[];
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  description,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  description?: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
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
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{value}</span>
              {trend && (
                <span className={`text-xs flex items-center gap-1 ${trend.positive ? "text-green-500" : "text-red-500"}`}>
                  <TrendingUp className={`w-3 h-3 ${!trend.positive && "rotate-180"}`} />
                  {trend.value}%
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThemeCard({ theme, count, rank }: { theme: string; count: number; rank: number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover-elevate">
      <span className="text-lg font-serif font-bold text-primary/30 w-6">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{theme}</p>
        <p className="text-xs text-muted-foreground">{count} mentions</p>
      </div>
    </div>
  );
}

function QuestionStatRow({ 
  question, 
  avgConfidence, 
  responseCount 
}: { 
  question: string; 
  avgConfidence: number; 
  responseCount: number;
}) {
  const confidenceColor = avgConfidence >= 80 ? "text-green-500" : avgConfidence >= 50 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover-elevate">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{question}</p>
        <p className="text-xs text-muted-foreground">{responseCount} responses</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-3 rounded-sm ${
                i < Math.ceil(avgConfidence / 20) 
                  ? avgConfidence >= 80 ? "bg-green-500" : avgConfidence >= 50 ? "bg-yellow-500" : "bg-red-500"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
        <span className={`text-sm font-medium ${confidenceColor}`}>
          {avgConfidence}%
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: collections } = useQuery<Collection[]>({
    queryKey: ["/api/projects", selectedProjectId, "collections"],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      const res = await fetch(`/api/projects/${selectedProjectId}/collections`);
      if (!res.ok) throw new Error("Failed to fetch collections");
      return res.json();
    },
    enabled: !!selectedProjectId,
  });

  const analyticsQueryKey = selectedCollectionId 
    ? ["/api/analytics", { collectionId: selectedCollectionId }]
    : selectedProjectId 
      ? ["/api/analytics", { projectId: selectedProjectId }]
      : ["/api/analytics"];

  const analyticsQueryFn = async () => {
    const params = new URLSearchParams();
    if (selectedCollectionId) params.set("collectionId", selectedCollectionId);
    else if (selectedProjectId) params.set("projectId", selectedProjectId);
    
    const url = `/api/analytics${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch analytics");
    return res.json();
  };

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: analyticsQueryKey,
    queryFn: analyticsQueryFn,
  });

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value === "all" ? "" : value);
    setSelectedCollectionId("");
  };

  const handleCollectionChange = (value: string) => {
    setSelectedCollectionId(value === "all" ? "" : value);
  };

  const getFilterLabel = () => {
    if (selectedCollectionId && collections) {
      const collection = collections.find(c => c.id === selectedCollectionId);
      return collection?.name || "Collection";
    }
    if (selectedProjectId && projects) {
      const project = projects.find(p => p.id === selectedProjectId);
      return project?.name || "Project";
    }
    return "All interviews";
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Insights across {getFilterLabel().toLowerCase()}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedProjectId || "all"} onValueChange={handleProjectChange}>
            <SelectTrigger className="w-[180px]" data-testid="select-project-filter">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map(project => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select 
            value={selectedCollectionId || "all"} 
            onValueChange={handleCollectionChange}
            disabled={!selectedProjectId}
          >
            <SelectTrigger className="w-[180px]" data-testid="select-collection-filter">
              <SelectValue placeholder="All Collections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Collections</SelectItem>
              {collections?.map(collection => (
                <SelectItem key={collection.id} value={collection.id}>
                  {collection.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Sessions"
          value={analytics?.totalSessions ?? 0}
          icon={Users}
          isLoading={isLoading}
        />
        <StatCard
          title="Completed"
          value={analytics?.completedSessions ?? 0}
          icon={CheckCircle2}
          isLoading={isLoading}
        />
        <StatCard
          title="Avg. Duration"
          value={analytics?.averageDuration ? formatDuration(analytics.averageDuration) : "—"}
          icon={Clock}
          isLoading={isLoading}
        />
        <StatCard
          title="Completion Rate"
          value={analytics?.completionRate ? `${Math.round(analytics.completionRate)}%` : "—"}
          icon={TrendingUp}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Top Themes
            </CardTitle>
            <CardDescription>
              Most frequently mentioned topics across interviews
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : analytics?.topThemes && analytics.topThemes.length > 0 ? (
              <div className="space-y-1">
                {analytics.topThemes.map((item, index) => (
                  <ThemeCard key={index} theme={item.theme} count={item.count} rank={index + 1} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No themes identified yet</p>
                <p className="text-xs mt-1">Complete more interviews to see patterns</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Question Performance
            </CardTitle>
            <CardDescription>
              Average confidence scores by question
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : analytics?.questionStats && analytics.questionStats.length > 0 ? (
              <div className="space-y-1">
                {analytics.questionStats.map((stat, index) => (
                  <QuestionStatRow 
                    key={index} 
                    question={stat.questionText} 
                    avgConfidence={stat.avgConfidence}
                    responseCount={stat.responseCount}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No question data yet</p>
                <p className="text-xs mt-1">Complete interviews to see performance metrics</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Quality Flags
          </CardTitle>
          <CardDescription>
            Common issues detected across interviews
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No quality flags detected</p>
            <p className="text-xs mt-1">Issues like incomplete responses or contradictions will appear here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
