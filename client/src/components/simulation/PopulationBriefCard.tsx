import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  AlertTriangle,
  Globe,
  Users,
  BarChart3,
  Brain,
  ExternalLink,
  Shield,
  BookOpen,
  CheckCircle,
} from "lucide-react";
import type { PopulationBrief } from "@shared/types/persona-generation";

export interface PopulationBriefSummary {
  id: string;
  researchPrompt: string;
  targetPopulation: string;
  confidence: "high" | "medium" | "low";
  isUngrounded: boolean;
  sourceCount: number;
  suggestedProfileCount: number;
  behavioralPatternCount: number;
  demographicDimensionCount: number;
  createdAt: string;
}

interface PopulationBriefCardProps {
  summary: PopulationBriefSummary;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (briefId: string) => void;
  projectId: string;
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
  if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  if (diffWeeks > 0) return `${diffWeeks} week${diffWeeks > 1 ? "s" : ""} ago`;
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  return "just now";
}

function isOlderThan90Days(dateStr: string): boolean {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  return diffMs > 90 * 24 * 60 * 60 * 1000;
}

const CONFIDENCE_BADGE_CLASSES: Record<string, string> = {
  high: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  low: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const LEVEL_BADGE_CLASSES: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  basic: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  intermediate: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  expert: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function ExpandedContent({ summary, projectId, onSelect }: {
  summary: PopulationBriefSummary;
  projectId: string;
  onSelect: (briefId: string) => void;
}) {
  const { data, isLoading } = useQuery<{ brief: PopulationBrief }>({
    queryKey: ["/api/projects", projectId, "personas", "briefs", summary.id],
    enabled: true,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3 pt-3" data-testid={`brief-loading-${summary.id}`}>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  const brief = data.brief;
  const profiles = brief.suggestedPersonaProfiles.slice(0, 5);
  const patterns = brief.behavioralPatterns.slice(0, 5);
  const biases = brief.biasesAndSensitivities.slice(0, 4);
  const domainLevels = brief.domainKnowledgeLevels.slice(0, 4);
  const sources = brief.sources.slice(0, 6);

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="space-y-4 pt-3 pr-2" data-testid={`brief-detail-${summary.id}`}>
        <div>
          <h4 className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            Demographics Summary
          </h4>
          <p className="text-sm text-muted-foreground" data-testid={`text-demographics-${summary.id}`}>
            {brief.demographics.summary}
          </p>
        </div>

        {profiles.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
              Suggested Persona Profiles
            </h4>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-1.5 font-medium">Archetype</th>
                    <th className="text-left px-3 py-1.5 font-medium">Rationale</th>
                    <th className="text-right px-3 py-1.5 font-medium">% of Pop.</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p, i) => (
                    <tr key={i} className="border-b last:border-b-0" data-testid={`row-profile-${i}`}>
                      <td className="px-3 py-1.5 font-medium">{p.archetype}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.rationale}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{p.representsPct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {patterns.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
              <Brain className="w-3.5 h-3.5 text-muted-foreground" />
              Key Behavioral Patterns
            </h4>
            <ul className="space-y-1">
              {patterns.map((p, i) => (
                <li key={i} className="text-sm" data-testid={`item-pattern-${i}`}>
                  <span className="font-medium">{p.pattern}</span>
                  <span className="text-muted-foreground"> — {p.prevalence}</span>
                  {p.source && <span className="text-muted-foreground"> — {p.source}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {biases.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              Biases & Sensitivities
            </h4>
            <ul className="space-y-1">
              {biases.map((b, i) => (
                <li key={i} className="text-sm" data-testid={`item-bias-${i}`}>
                  <span className="font-medium">{b.topic}</span>
                  <span className="text-muted-foreground"> — {b.nature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {domainLevels.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
              Domain Knowledge Spectrum
            </h4>
            <ul className="space-y-1.5">
              {domainLevels.map((d, i) => (
                <li key={i} className="text-sm flex flex-wrap items-center gap-1.5" data-testid={`item-domain-${i}`}>
                  <span>{d.segment}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 no-default-hover-elevate ${LEVEL_BADGE_CLASSES[d.level] || ""}`}
                  >
                    {d.level}
                  </Badge>
                  <span className="text-muted-foreground">{d.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {sources.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              Sources
            </h4>
            <ul className="space-y-1">
              {sources.map((s, i) => (
                <li key={i} className="text-sm flex flex-wrap items-center gap-1.5" data-testid={`item-source-${i}`}>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
                      data-testid={`link-source-${i}`}
                    >
                      {s.title}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span>{s.title}</span>
                  )}
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 no-default-hover-elevate"
                  >
                    {s.relevance}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 pb-1">
          <Button
            onClick={() => onSelect(summary.id)}
            className="w-full"
            data-testid={`button-select-brief-${summary.id}`}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Select This Brief
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

export function PopulationBriefCard({
  summary,
  isExpanded,
  onToggleExpand,
  onSelect,
  projectId,
}: PopulationBriefCardProps) {
  const truncatedPopulation = summary.targetPopulation.length > 80
    ? summary.targetPopulation.slice(0, 80) + "..."
    : summary.targetPopulation;

  const truncatedPrompt = summary.researchPrompt.length > 150
    ? summary.researchPrompt.slice(0, 150) + "..."
    : summary.researchPrompt;

  const outdated = isOlderThan90Days(summary.createdAt);

  return (
    <Card
      className="hover-elevate overflow-visible"
      data-testid={`card-brief-${summary.id}`}
    >
      <CardContent className="p-4">
        <button
          type="button"
          className="w-full text-left"
          onClick={onToggleExpand}
          data-testid={`button-toggle-brief-${summary.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug" data-testid={`text-population-${summary.id}`}>
              {truncatedPopulation}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className={`text-[10px] no-default-hover-elevate ${CONFIDENCE_BADGE_CLASSES[summary.confidence]}`}
                data-testid={`badge-confidence-${summary.id}`}
              >
                {summary.confidence}
              </Badge>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                data-testid={`icon-expand-${summary.id}`}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-1 leading-relaxed" data-testid={`text-prompt-${summary.id}`}>
            {truncatedPrompt}
          </p>

          <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1">
            <span>{summary.sourceCount} sources</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{summary.suggestedProfileCount} profiles</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{summary.demographicDimensionCount} demographics</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{summary.behavioralPatternCount} patterns</span>
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-xs text-muted-foreground" data-testid={`text-created-${summary.id}`}>
              {relativeTime(summary.createdAt)}
            </span>
            {summary.isUngrounded && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" data-testid={`warning-ungrounded-${summary.id}`}>
                <AlertTriangle className="w-3 h-3" />
                Ungrounded research
              </span>
            )}
            {outdated && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" data-testid={`warning-outdated-${summary.id}`}>
                <AlertTriangle className="w-3 h-3" />
                Research may be outdated
              </span>
            )}
          </div>
        </button>

        {isExpanded && (
          <ExpandedContent
            summary={summary}
            projectId={projectId}
            onSelect={onSelect}
          />
        )}
      </CardContent>
    </Card>
  );
}
