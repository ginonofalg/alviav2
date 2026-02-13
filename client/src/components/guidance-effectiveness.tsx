import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Minus,
  TrendingUp,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import type {
  BarbaraGuidanceLogEntry,
  GuidanceAdherenceSummary,
  BarbaraGuidanceAction,
} from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GuidanceEffectivenessProps {
  sessionId: string;
}

type EffectivenessResponse = {
  scoredLog: BarbaraGuidanceLogEntry[];
  summary: GuidanceAdherenceSummary | null;
  hasData: boolean;
  unscored?: boolean;
  reason?: string;
};

const ACTION_LABELS: Record<BarbaraGuidanceAction, string> = {
  probe_followup: "Probe / Follow-up",
  suggest_next_question: "Move to Next Question",
  acknowledge_prior: "Acknowledge Response",
  confirm_understanding: "Confirm Understanding",
  suggest_environment_check: "Environment Check",
  time_reminder: "Time Reminder",
  none: "No Action",
};

const ACTION_ICONS: Record<BarbaraGuidanceAction, typeof Eye> = {
  probe_followup: MessageSquare,
  suggest_next_question: ArrowRight,
  acknowledge_prior: CheckCircle2,
  confirm_understanding: Eye,
  suggest_environment_check: AlertTriangle,
  time_reminder: TrendingUp,
  none: Minus,
};

function AdherenceBadge({ adherence }: { adherence?: string }) {
  switch (adherence) {
    case "followed":
      return (
        <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white no-default-hover-elevate" data-testid="badge-followed">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Followed
        </Badge>
      );
    case "partially_followed":
      return (
        <Badge variant="default" className="bg-amber-500 dark:bg-amber-600 text-white no-default-hover-elevate" data-testid="badge-partial">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Partial
        </Badge>
      );
    case "not_followed":
      return (
        <Badge variant="default" className="bg-red-500 dark:bg-red-600 text-white no-default-hover-elevate" data-testid="badge-not-followed">
          <XCircle className="w-3 h-3 mr-1" />
          Not Followed
        </Badge>
      );
    case "not_applicable":
      return (
        <Badge variant="secondary" className="no-default-hover-elevate" data-testid="badge-na">
          <Minus className="w-3 h-3 mr-1" />
          N/A
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="no-default-hover-elevate" data-testid="badge-unscored">
          Unscored
        </Badge>
      );
  }
}

function AdherenceRateDisplay({ rate, label }: { rate: number; label: string }) {
  const percentage = Math.round(rate * 100);
  let colorClass = "text-muted-foreground";
  if (percentage >= 75) colorClass = "text-green-600 dark:text-green-400";
  else if (percentage >= 50) colorClass = "text-amber-600 dark:text-amber-400";
  else if (percentage > 0) colorClass = "text-red-600 dark:text-red-400";

  return (
    <div className="text-center" data-testid={`adherence-rate-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className={`text-2xl font-bold ${colorClass}`}>{percentage}%</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function GuidanceEffectivenessCard({ sessionId }: GuidanceEffectivenessProps) {
  const { data, isLoading, error } = useQuery<EffectivenessResponse>({
    queryKey: ["/api/sessions", sessionId, "guidance-effectiveness"],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/guidance-effectiveness`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch guidance effectiveness");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-guidance-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Barbara Guidance Effectiveness
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  if (!data.hasData) {
    return (
      <Card data-testid="card-guidance-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Barbara Guidance Effectiveness
          </CardTitle>
          <CardDescription>
            No guidance events were recorded during this interview.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (data.unscored) {
    return (
      <Card data-testid="card-guidance-unscored">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Barbara Guidance Effectiveness
          </CardTitle>
          <CardDescription>
            {data.reason || "Guidance data available but could not be scored."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {data.scoredLog.length} guidance event(s) recorded but no transcript available for adherence scoring.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary, scoredLog } = data;
  const injectedEntries = scoredLog.filter((e) => e.injected);

  return (
    <Card data-testid="card-guidance-effectiveness">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="w-5 h-5" />
          Barbara Guidance Effectiveness
        </CardTitle>
        <CardDescription>
          How well Alvia followed Barbara's real-time guidance during this interview
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {summary && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <AdherenceRateDisplay
                rate={summary.overallAdherenceRate}
                label="Overall Adherence"
              />
              <div className="flex gap-6 flex-wrap">
                <div className="text-center">
                  <div className="text-lg font-semibold" data-testid="text-total-events">{summary.totalGuidanceEvents}</div>
                  <div className="text-xs text-muted-foreground">Total Events</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold" data-testid="text-injected-count">{summary.injectedCount}</div>
                  <div className="text-xs text-muted-foreground">Injected</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-followed-count">{summary.followedCount}</div>
                  <div className="text-xs text-muted-foreground">Followed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-amber-600 dark:text-amber-400" data-testid="text-partial-count">{summary.partiallyFollowedCount}</div>
                  <div className="text-xs text-muted-foreground">Partial</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="text-not-followed-count">{summary.notFollowedCount}</div>
                  <div className="text-xs text-muted-foreground">Not Followed</div>
                </div>
              </div>
            </div>

            {Object.entries(summary.byAction)
              .filter(([, stats]) => stats.total > 0 && stats.injected > 0)
              .length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">By Action Type</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(summary.byAction)
                    .filter(([, stats]) => stats.total > 0 && stats.injected > 0)
                    .map(([action, stats]) => {
                      const ActionIcon = ACTION_ICONS[action as BarbaraGuidanceAction] || Eye;
                      return (
                        <div
                          key={action}
                          className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                          data-testid={`action-row-${action}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ActionIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <span className="text-sm truncate">
                              {ACTION_LABELS[action as BarbaraGuidanceAction] || action}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {stats.followed}/{stats.injected}
                            </span>
                            <Badge
                              variant="secondary"
                              className="no-default-hover-elevate"
                            >
                              {Math.round(stats.adherenceRate * 100)}%
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {injectedEntries.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Guidance Log ({injectedEntries.length} injected event{injectedEntries.length !== 1 ? "s" : ""})
            </h4>
            <div className="space-y-2">
              {injectedEntries.map((entry, idx) => {
                const ActionIcon = ACTION_ICONS[entry.action] || Eye;
                return (
                  <div
                    key={entry.index ?? idx}
                    className="p-3 rounded-md border space-y-2"
                    data-testid={`guidance-entry-${entry.index ?? idx}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <ActionIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Q{entry.questionIndex + 1}
                        </span>
                      </div>
                      <AdherenceBadge adherence={entry.adherence} />
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground line-clamp-2 cursor-help">
                          {entry.messageSummary}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-sm">
                        <p className="text-xs">{entry.messageSummary}</p>
                      </TooltipContent>
                    </Tooltip>

                    {entry.adherenceReason && (
                      <p className="text-xs text-muted-foreground/70 italic">
                        {entry.adherenceReason}
                      </p>
                    )}

                    {entry.alviaResponseSnippet && (
                      <div className="text-xs bg-muted/50 rounded p-2">
                        <span className="font-medium">Alvia's response: </span>
                        <span className="text-muted-foreground">{entry.alviaResponseSnippet}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
