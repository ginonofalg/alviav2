import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, FileSearch } from "lucide-react";
import { PopulationBriefCard } from "./PopulationBriefCard";
import type { PopulationBriefSummary } from "./PopulationBriefCard";

interface BriefSelectionViewProps {
  projectId: string;
  personaCount: string;
  setPersonaCount: (val: string) => void;
  diversityMode: string;
  setDiversityMode: (val: string) => void;
  edgeCases: boolean;
  setEdgeCases: (val: boolean) => void;
  onSelectBrief: (briefId: string) => void;
  onBack: () => void;
}

export function BriefSelectionView({
  projectId,
  personaCount,
  setPersonaCount,
  diversityMode,
  setDiversityMode,
  edgeCases,
  setEdgeCases,
  onSelectBrief,
  onBack,
}: BriefSelectionViewProps) {
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null);

  const { data: briefs, isLoading } = useQuery<PopulationBriefSummary[]>({
    queryKey: ["/api/projects", projectId, "personas", "briefs"],
  });

  const handleToggleExpand = (briefId: string) => {
    setExpandedBriefId((prev) => (prev === briefId ? null : briefId));
  };

  return (
    <div className="flex flex-col min-h-0 flex-1" data-testid="brief-selection-view">
      <div className="flex items-start gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          data-testid="button-back-briefs"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-brief-selection-title">
            Select Population Research
          </h3>
          <p className="text-sm text-muted-foreground" data-testid="text-brief-selection-subtitle">
            Choose existing research, then click "Use This Research" to generate personas
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mt-4 shrink-0">
        <div className="space-y-2">
          <Label>Persona count</Label>
          <Select value={personaCount} onValueChange={setPersonaCount}>
            <SelectTrigger className="w-[80px]" data-testid="select-brief-persona-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Diversity mode</Label>
          <Select value={diversityMode} onValueChange={setDiversityMode}>
            <SelectTrigger className="w-[130px]" data-testid="select-brief-diversity-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="maximize">Maximize</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="brief-edge-cases"
            checked={edgeCases}
            onCheckedChange={setEdgeCases}
            data-testid="switch-brief-edge-cases"
          />
          <Label htmlFor="brief-edge-cases" className="text-sm">Edge cases</Label>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3 mt-4" data-testid="brief-list-loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 p-4 rounded-md border">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && briefs && briefs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3" data-testid="brief-empty-state">
          <FileSearch className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm font-medium" data-testid="text-no-briefs-title">
            No population research yet
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-xs" data-testid="text-no-briefs-subtitle">
            Run research first to create a population brief that can be reused
          </p>
          <Button
            variant="outline"
            onClick={onBack}
            data-testid="button-back-to-research"
          >
            Back to Research
          </Button>
        </div>
      )}

      {!isLoading && briefs && briefs.length > 0 && (
        <ScrollArea className="flex-1 min-h-0 mt-4" data-testid="brief-list-scroll">
          <div className="space-y-3 pr-3">
            {briefs.map((summary) => (
              <PopulationBriefCard
                key={summary.id}
                summary={summary}
                isExpanded={expandedBriefId === summary.id}
                onToggleExpand={() => handleToggleExpand(summary.id)}
                onSelect={onSelectBrief}
                projectId={projectId}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
