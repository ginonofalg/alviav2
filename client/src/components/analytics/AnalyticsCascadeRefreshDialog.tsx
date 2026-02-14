import { useState, useEffect } from "react";
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

interface CascadeRefreshResult {
  success: boolean;
  results: {
    collectionsRefreshed: number;
    templatesRefreshed?: number;
    templateRefreshed?: boolean;
    projectRefreshed?: boolean;
    errors: Array<{ level: string; id: string; name: string; error: string }>;
  };
  analytics: unknown;
  lastAnalyzedAt: string | null;
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scopeParam = `?sessionScope=${sessionScope}`;
  const dependenciesEndpoint = level === "project"
    ? `/api/projects/${entityId}/analytics/dependencies${scopeParam}`
    : `/api/templates/${entityId}/analytics/dependencies${scopeParam}`;

  const cascadeEndpoint = level === "project"
    ? `/api/projects/${entityId}/analytics/cascade-refresh${scopeParam}`
    : `/api/templates/${entityId}/analytics/cascade-refresh${scopeParam}`;

  const { data: dependencies, isLoading, isError, error, refetch } = useQuery<ProjectDependencies | TemplateDependencies>({
    queryKey: [dependenciesEndpoint, sessionScope],
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const cascadeMutation = useMutation({
    mutationFn: async () => {
      setIsRefreshing(true);
      return apiRequestJson<CascadeRefreshResult>(
        "POST",
        cascadeEndpoint,
        undefined,
        { timeoutMs: 600000 } // 10 minutes for large projects
      );
    },
    onSuccess: async (data) => {
      setIsRefreshing(false);
      
      const baseKey = level === "project"
        ? ["/api/projects", entityId, "analytics"]
        : ["/api/templates", entityId, "analytics"];
      
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey as string[];
          return key[0] === baseKey[0] && key[1] === baseKey[1] && key[2] === baseKey[2];
        },
      });

      const results = data.results;
      const parts: string[] = [];
      
      if (results.collectionsRefreshed > 0) {
        parts.push(`${results.collectionsRefreshed} collection${results.collectionsRefreshed !== 1 ? 's' : ''}`);
      }
      if (level === "project" && results.templatesRefreshed && results.templatesRefreshed > 0) {
        parts.push(`${results.templatesRefreshed} template${results.templatesRefreshed !== 1 ? 's' : ''}`);
      }
      if (level === "project" && results.projectRefreshed) {
        parts.push("project");
      }
      if (level === "template" && results.templateRefreshed) {
        parts.push("template");
      }

      if (results.errors.length > 0) {
        toast({
          title: "Partial refresh completed",
          description: `Refreshed ${parts.join(", ")} with ${results.errors.length} error(s).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Analysis complete",
          description: `Successfully refreshed ${parts.join(", ")}.`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      setIsRefreshing(false);
      
      // Check if this was a timeout - if so, refresh anyway as data may have been saved
      const isTimeout = error.message.includes("timed out");
      const isNetworkError = error.message.includes("Network error");
      
      if (isTimeout || isNetworkError) {
        toast({
          title: "Connection issue",
          description: "The refresh may have completed. Please reload to check for updates.",
          variant: "destructive",
        });
        const errorBaseKey = level === "project"
          ? ["/api/projects", entityId, "analytics"]
          : ["/api/templates", entityId, "analytics"];
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey as string[];
            return key[0] === errorBaseKey[0] && key[1] === errorBaseKey[1] && key[2] === errorBaseKey[2];
          },
        });
      } else {
        toast({
          title: "Refresh failed",
          description: error.message,
          variant: "destructive",
        });
      }
      onOpenChange(false);
    },
  });

  const summary = dependencies?.summary;
  const hasStale = summary?.hasAnyStale || false;

  const staleCollections = level === "project"
    ? (dependencies as ProjectDependencies)?.templates?.flatMap(t => t.collections.filter(c => c.isStale)) || []
    : (dependencies as TemplateDependencies)?.collections?.filter(c => c.isStale) || [];

  const staleTemplates = level === "project"
    ? (dependencies as ProjectDependencies)?.templates?.filter(t => t.isStale || t.staleCollectionCount > 0) || []
    : [];

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

        {isLoading ? (
          <div className="space-y-3 py-4" data-testid="skeleton-dependencies">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
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
          <div className="py-8 text-center" data-testid="refreshing-state">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-primary mb-4" />
            <p className="font-medium">Refreshing analytics...</p>
            <p className="text-sm text-muted-foreground mt-1">
              This may take a few minutes for large datasets.
            </p>
            <div className="mt-4 text-xs text-muted-foreground">
              {staleCollections.length > 0 && (
                <p>Analyzing {staleCollections.length} collection{staleCollections.length !== 1 ? 's' : ''}...</p>
              )}
              {staleTemplates.length > 0 && (
                <p>Then {staleTemplates.length} template{staleTemplates.length !== 1 ? 's' : ''}...</p>
              )}
              <p>Finally {level} analytics</p>
            </div>
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
            Cancel
          </Button>
          <Button
            onClick={() => cascadeMutation.mutate()}
            disabled={isLoading || isRefreshing}
            data-testid="button-refresh-all"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isError ? "Refresh Anyway" : hasStale ? "Refresh All" : "Refresh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
