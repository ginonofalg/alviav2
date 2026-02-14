import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Ban, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SimulationRun {
  id: string;
  collectionId: string;
  status: string;
  personaIds: string[];
  totalSimulations: number;
  completedSimulations: number;
  failedSimulations: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  enableBarbara: boolean;
  enableSummaries: boolean;
  enableAdditionalQuestions: boolean;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { icon: Clock, label: "Pending", variant: "secondary" },
  running: { icon: Loader2, label: "Running", variant: "default" },
  completed: { icon: CheckCircle2, label: "Completed", variant: "default" },
  failed: { icon: XCircle, label: "Failed", variant: "destructive" },
  cancelled: { icon: Ban, label: "Cancelled", variant: "secondary" },
};

function SimulationRunCard({ run }: { run: SimulationRun }) {
  const { toast } = useToast();
  const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const progress = run.totalSimulations > 0 ? ((run.completedSimulations + run.failedSimulations) / run.totalSimulations) * 100 : 0;

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/simulation-runs/${run.id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections", run.collectionId, "simulation-runs"] });
      toast({ title: "Simulation cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-simulation-run-${run.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={`w-4 h-4 shrink-0 ${run.status === "running" ? "animate-spin" : ""}`} />
          <CardTitle className="text-sm font-medium">
            {run.totalSimulations} persona{run.totalSimulations !== 1 ? "s" : ""}
          </CardTitle>
          <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
        </div>
        {(run.status === "running" || run.status === "pending") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            data-testid="button-cancel-simulation"
          >
            Cancel
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {run.status === "running" && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {run.completedSimulations} of {run.totalSimulations} complete
              {run.failedSimulations > 0 && ` (${run.failedSimulations} failed)`}
            </p>
          </div>
        )}

        {run.status === "completed" && (
          <p className="text-xs text-muted-foreground">
            {run.completedSimulations} completed, {run.failedSimulations} failed
          </p>
        )}

        {run.errorMessage && (
          <p className="text-xs text-destructive">{run.errorMessage}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {run.createdAt && (
            <span>Started {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</span>
          )}
          <div className="flex gap-1">
            {run.enableBarbara && <Badge variant="outline" className="text-xs">Barbara</Badge>}
            {run.enableSummaries && <Badge variant="outline" className="text-xs">Summaries</Badge>}
            {run.enableAdditionalQuestions && <Badge variant="outline" className="text-xs">AQs</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SimulationProgressProps {
  collectionId: string;
}

export function SimulationProgressList({ collectionId }: SimulationProgressProps) {
  const { data: runs, isLoading } = useQuery<SimulationRun[]>({
    queryKey: ["/api/collections", collectionId, "simulation-runs"],
    enabled: !!collectionId,
    refetchInterval: (query) => {
      const data = query.state.data as SimulationRun[] | undefined;
      const hasActive = data?.some((r) => r.status === "running" || r.status === "pending");
      return hasActive ? 3000 : false;
    },
  });

  if (isLoading || !runs || runs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Simulation Runs</h4>
      {runs.map((run) => (
        <SimulationRunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
