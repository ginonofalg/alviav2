import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play } from "lucide-react";
import { PersonaCard } from "./PersonaCard";
import type { Persona, Collection } from "@shared/schema";

interface SimulationLauncherProps {
  collection: Collection;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimulationLauncher({ collection, projectId, open, onOpenChange }: SimulationLauncherProps) {
  const { toast } = useToast();
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [enableBarbara, setEnableBarbara] = useState(true);
  const [enableSummaries, setEnableSummaries] = useState(true);
  const [enableAdditionalQuestions, setEnableAdditionalQuestions] = useState(true);

  const { data: personas, isLoading } = useQuery<Persona[]>({
    queryKey: ["/api/projects", projectId, "personas"],
    enabled: open && !!projectId,
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/collections/${collection.id}/simulate`, {
        personaIds: selectedPersonaIds,
        enableBarbara,
        enableSummaries,
        enableAdditionalQuestions,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections", collection.id, "simulation-runs"] });
      onOpenChange(false);
      setSelectedPersonaIds([]);
      toast({ title: "Simulation launched", description: `Running ${selectedPersonaIds.length} simulated interviews...` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to launch", description: err.message, variant: "destructive" });
    },
  });

  const togglePersona = (persona: Persona) => {
    setSelectedPersonaIds((prev) =>
      prev.includes(persona.id) ? prev.filter((id) => id !== persona.id) : [...prev, persona.id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Launch Simulation</DialogTitle>
          <DialogDescription>
            Select personas to simulate interviews for "{collection.name}". Each persona will generate a complete interview session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Select Personas ({selectedPersonaIds.length}/10 selected)</h4>
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            ) : personas && personas.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {personas.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    onEdit={() => {}}
                    onArchive={() => {}}
                    selectable
                    selected={selectedPersonaIds.includes(persona.id)}
                    onSelect={togglePersona}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No personas available. Create personas in the project's Personas tab first.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium">Options</h4>
            <div className="flex items-center gap-2">
              <Checkbox id="barbara" checked={enableBarbara} onCheckedChange={(v) => setEnableBarbara(!!v)} data-testid="checkbox-enable-barbara" />
              <Label htmlFor="barbara" className="text-sm">Enable Barbara guidance (recommended)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="summaries" checked={enableSummaries} onCheckedChange={(v) => setEnableSummaries(!!v)} data-testid="checkbox-enable-summaries" />
              <Label htmlFor="summaries" className="text-sm">Generate session summaries</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="aq" checked={enableAdditionalQuestions} onCheckedChange={(v) => setEnableAdditionalQuestions(!!v)} data-testid="checkbox-enable-aq" />
              <Label htmlFor="aq" className="text-sm">Generate additional questions</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => launchMutation.mutate()}
            disabled={selectedPersonaIds.length === 0 || launchMutation.isPending}
            data-testid="button-launch-simulation"
          >
            {launchMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Launch {selectedPersonaIds.length} Simulation{selectedPersonaIds.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
