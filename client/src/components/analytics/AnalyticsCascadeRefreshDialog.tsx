import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  AlertTriangle,
  Layers,
  FileText,
  CheckCircle,
  XCircle,
  Circle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";

interface CollectionDependency {
  id: string;
  name: string;
  isStale: boolean;
  hasData: boolean;
  lastAnalyzedAt: string | null;
  totalSessions: number;
  analyzedSessions: number;
  newSessions: number;
}

interface TemplateDependency {
  id: string;
  name: string;
  isStale: boolean;
  hasData: boolean;
  lastAnalyzedAt: string | null;
  collections: CollectionDependency[];
  staleCollectionCount: number;
}

interface ProjectDependencies {
  projectId: string;
  projectName: string;
  projectStale: boolean;
  templates: TemplateDependency[];
  summary: {
    staleCollections: number;
    staleTemplates: number;
    totalRefreshesNeeded: number;
    hasAnyStale: boolean;
  };
}

interface TemplateDependencies {
  templateId: string;
  templateName: string;
  templateStale: boolean;
  collections: CollectionDependency[];
  summary: {
    staleCollections: number;
    totalRefreshesNeeded: number;
    hasAnyStale: boolean;
  };
}

interface JobStep {
  name: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
}

interface AnalyticsJob {
  id: string;
  level: "project" | "template";
  entityId: string;
  entityName: string;
  phase: string;
  steps: JobStep[];
  currentStepIndex: number;
  collectionsRefreshed: number;
  templatesRefreshed: number;
  projectRefreshed: boolean;
  templateRefreshed: boolean;
  errors: Array<{ level: string; id: string; name: string; error: string }>;
  createdAt: number;
  updatedAt: number;
}

interface AnalyticsCascadeRefreshDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: "project" | "template";
  entityId: string;
  entityName: string;
  onSuccess?: () => void;
  sessionScope?: string;
}

const POLL_INTERVAL_MS = 2500;

export function AnalyticsCascadeRefreshDialog({
  open,
  onOpenChange,
  level,
  entityId,
  entityName,
  onSuccess,
  sessionScope = "combined",
}: AnalyticsCascadeRefreshDialogProps) {
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<AnalyticsJob | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorCountRef = useRef(0);

  const scopeParam = `?sessionScope=${sessionScope}`;
  const dependenciesEndpoint = level === "project"
    ? `/api/projects/${entityId}/analytics/dependencies${scopeParam}`
    : `/api/templates/${entityId}/analytics/dependencies${scopeParam}`;

  const cascadeEndpoint = level === "project"
    ? `/api/projects/${entityId}/analytics/cascade-refresh${scopeParam}`
    : `/api/templates/${entityId}/analytics/cascade-refresh${scopeParam}`;

  const { data: dependencies, isLoading, isError, error, refetch } = useQuery<ProjectDependencies | TemplateDependencies>({
    queryKey: [dependenciesEndpoint, sessionScope],
    enabled: open && !jobId,
  });

  useEffect(() => {
    if (open && !jobId) {
      refetch();
    }
  }, [open, refetch, jobId]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollErrorCountRef.current = 0;
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollErrorCountRef.current = 0;
    pollTimerRef.current = setInterval(() => pollJobStatusRef.current(id), POLL_INTERVAL_MS);
  }, [stopPolling]);

  const pollJobStatusRef = useRef<(id: string) => Promise<void>>(async () => {});

  const pollJobStatus = useCallback(async (id: string) => {
    try {
      const job = await apiRequestJson<AnalyticsJob>("GET", `/api/analytics/jobs/${id}`);
      pollErrorCountRef.current = 0;
      setJobData(job);

      if (job.phase === "complete" || job.phase === "failed" || job.phase === "interrupted") {
        stopPolling();
        handleJobComplete(job);
      }
    } catch (err: any) {
      pollErrorCountRef.current++;
      const is404 = err?.message?.includes("404");
      if (is404 || pollErrorCountRef.current >= 5) {
        stopPolling();
        toast({
          title: "Connection lost",
          description: is404
            ? "The refresh job was lost (server may have restarted). Please try again."
            : "Could not reach the server. The refresh may still be running in the background.",
          variant: "destructive",
        });
        setJobId(null);
        setJobData(null);
      }
    }
  }, [stopPolling, toast]);

  const handleJobComplete = useCallback((job: AnalyticsJob) => {
    const baseKey = level === "project"
      ? ["/api/projects", entityId, "analytics"]
      : ["/api/templates", entityId, "analytics"];

    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey as string[];
        return key[0] === baseKey[0] && key[1] === baseKey[1] && key[2] === baseKey[2];
      },
    });

    const parts: string[] = [];
    if (job.collectionsRefreshed > 0) {
      parts.push(`${job.collectionsRefreshed} collection${job.collectionsRefreshed !== 1 ? 's' : ''}`);
    }
    if (level === "project" && job.templatesRefreshed > 0) {
      parts.push(`${job.templatesRefreshed} template${job.templatesRefreshed !== 1 ? 's' : ''}`);
    }
    if (level === "project" && job.projectRefreshed) {
      parts.push("project");
    }
    if (level === "template" && job.templateRefreshed) {
      parts.push("template");
    }

    if (job.phase === "failed" && job.errors.length > 0) {
      toast({
        title: "Partial refresh completed",
        description: `Refreshed ${parts.join(", ") || "nothing"} with ${job.errors.length} error(s).`,
        variant: "destructive",
      });
    } else if (job.phase === "interrupted") {
      toast({
        title: "Refresh interrupted",
        description: "The server restarted during the refresh. You can retry.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Analysis complete",
        description: `Successfully refreshed ${parts.join(", ")}.`,
      });
    }

    setTimeout(() => {
      setJobId(null);
      setJobData(null);
      onOpenChange(false);
      onSuccess?.();
    }, 1000);
  }, [level, entityId, onOpenChange, onSuccess, toast]);

  const startRefresh = useMutation({
    mutationFn: async () => {
      return apiRequestJson<{ jobId: string; alreadyRunning?: boolean }>(
        "POST",
        cascadeEndpoint,
      );
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      setJobData(null);

      pollJobStatus(data.jobId);
      startPolling(data.jobId);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start refresh",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  pollJobStatusRef.current = pollJobStatus;

  useEffect(() => {
    if (open && jobId && !pollTimerRef.current) {
      pollJobStatus(jobId);
      startPolling(jobId);
    }
    if (!open) {
      stopPolling();
      if (jobData?.phase === "complete" || jobData?.phase === "failed" || !jobId) {
        setJobId(null);
        setJobData(null);
      }
    }
  }, [open, jobId, stopPolling, startPolling, pollJobStatus, jobData]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const isRefreshing = !!jobId;
  const summary = dependencies?.summary;
  const hasStale = summary?.hasAnyStale || false;

  const staleCollections = level === "project"
    ? (dependencies as ProjectDependencies)?.templates?.flatMap(t => t.collections.filter(c => c.isStale)) || []
    : (dependencies as TemplateDependencies)?.collections?.filter(c => c.isStale) || [];

  const staleTemplates = level === "project"
    ? (dependencies as ProjectDependencies)?.templates?.filter(t => t.isStale || t.staleCollectionCount > 0) || []
    : [];

  const currentStep = jobData?.steps?.[jobData.currentStepIndex];
  const completedSteps = jobData?.steps?.filter(s => s.status === "done").length ?? 0;
  const totalSteps = jobData?.steps?.length ?? 0;

  const phaseLabel = jobData?.phase === "refreshing_collections"
    ? "Analyzing collections..."
    : jobData?.phase === "refreshing_templates"
      ? "Analyzing templates..."
      : jobData?.phase === "refreshing_project" || jobData?.phase === "refreshing_template"
        ? `Analyzing ${level}...`
        : "Starting...";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-cascade-refresh">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Refresh Analytics
          </DialogTitle>
          <DialogDescription>
            {entityName}
          </DialogDescription>
        </DialogHeader>

        {isLoading && !isRefreshing ? (
          <div className="space-y-3 py-4" data-testid="skeleton-dependencies">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError && !isRefreshing ? (
          <div className="py-6 text-center" data-testid="error-state">
            <XCircle className="w-8 h-8 mx-auto text-destructive mb-2" />
            <p className="font-medium">Failed to check dependencies</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error)?.message || "An error occurred while checking what needs to be refreshed."}
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              You can still try refreshing, which will update all stale analytics.
            </p>
          </div>
        ) : isRefreshing ? (
          <div className="py-4" data-testid="refreshing-state">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary flex-shrink-0" />
              <div>
                <p className="font-medium">{phaseLabel}</p>
                <p className="text-sm text-muted-foreground">
                  Step {completedSteps + (currentStep?.status === "running" ? 1 : 0)} of {totalSteps}
                </p>
              </div>
            </div>

            {jobData && jobData.steps.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {jobData.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    {step.status === "done" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    ) : step.status === "running" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
                    ) : step.status === "error" ? (
                      <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span className={step.status === "pending" ? "text-muted-foreground/60" : step.status === "error" ? "text-destructive" : ""}>
                      {step.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {jobData && jobData.errors.length > 0 && (
              <div className="mt-3 p-2 rounded bg-destructive/10 text-sm text-destructive">
                {jobData.errors.length} error(s) so far
              </div>
            )}
          </div>
        ) : hasStale ? (
          <div className="py-2 space-y-4" data-testid="stale-dependencies">
            <p className="text-sm text-muted-foreground">
              Some analytics are out of date and need to be refreshed first:
            </p>

            {staleCollections.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium text-sm">
                    {staleCollections.length} collection{staleCollections.length !== 1 ? 's' : ''} need refresh
                  </span>
                </div>
                <ul className="ml-6 space-y-1">
                  {staleCollections.slice(0, 5).map((collection) => (
                    <li key={collection.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="w-3 h-3" />
                      <span className="truncate">{collection.name}</span>
                      {collection.newSessions > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {collection.newSessions} new session{collection.newSessions !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {!collection.lastAnalyzedAt && (
                        <Badge variant="outline" className="text-xs">
                          never analyzed
                        </Badge>
                      )}
                    </li>
                  ))}
                  {staleCollections.length > 5 && (
                    <li className="text-sm text-muted-foreground ml-5">
                      +{staleCollections.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}

            {level === "project" && staleTemplates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium text-sm">
                    {staleTemplates.length} template{staleTemplates.length !== 1 ? 's' : ''} need refresh
                  </span>
                </div>
                <ul className="ml-6 space-y-1">
                  {staleTemplates.slice(0, 5).map((template) => (
                    <li key={template.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{template.name}</span>
                      {template.staleCollectionCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {template.staleCollectionCount} stale collection{template.staleCollectionCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </li>
                  ))}
                  {staleTemplates.length > 5 && (
                    <li className="text-sm text-muted-foreground ml-5">
                      +{staleTemplates.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t text-sm text-muted-foreground">
              <span className="font-medium">Refresh All</span> will refresh{" "}
              {staleCollections.length > 0 && (
                <>{staleCollections.length} collection{staleCollections.length !== 1 ? 's' : ''}</>
              )}
              {staleCollections.length > 0 && staleTemplates.length > 0 && ", "}
              {staleTemplates.length > 0 && (
                <>{staleTemplates.length} template{staleTemplates.length !== 1 ? 's' : ''}</>
              )}
              {(staleCollections.length > 0 || staleTemplates.length > 0) && ", then "}
              {level} analytics.
            </div>
          </div>
        ) : (
          <div className="py-4 text-center" data-testid="no-stale-dependencies">
            <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" />
            <p className="font-medium">All dependencies are up to date</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click Refresh to regenerate {level} analytics.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRefreshing}
            data-testid="button-cancel"
          >
            {isRefreshing ? "Running in background..." : "Cancel"}
          </Button>
          {!isRefreshing && (
            <Button
              onClick={() => startRefresh.mutate()}
              disabled={isLoading || startRefresh.isPending}
              data-testid="button-refresh-all"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${startRefresh.isPending ? "animate-spin" : ""}`} />
              {isError ? "Refresh Anyway" : hasStale ? "Refresh All" : "Refresh"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
