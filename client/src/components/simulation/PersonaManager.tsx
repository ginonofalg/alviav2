import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, User } from "lucide-react";
import { PersonaCard } from "./PersonaCard";
import { PersonaFormDialog } from "./PersonaFormDialog";
import type { Persona } from "@shared/schema";

interface PersonaManagerProps {
  projectId: string;
}

export function PersonaManager({ projectId }: PersonaManagerProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

  const { data: personas, isLoading } = useQuery<Persona[]>({
    queryKey: ["/api/projects", projectId, "personas"],
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/personas`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "personas"] });
      setDialogOpen(false);
      toast({ title: "Persona created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/personas/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "personas"] });
      setEditingPersona(null);
      setDialogOpen(false);
      toast({ title: "Persona updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/personas/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "personas"] });
      toast({ title: "Persona archived" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (data: any) => {
    if (editingPersona) {
      updateMutation.mutate({ id: editingPersona.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (persona: Persona) => {
    setEditingPersona(persona);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingPersona(null);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Create simulated respondent personas to test your interview questions.
        </p>
        <Button onClick={handleNew} data-testid="button-new-persona">
          <Plus className="w-4 h-4 mr-2" />
          New Persona
        </Button>
      </div>

      {personas && personas.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              onEdit={handleEdit}
              onArchive={(p) => archiveMutation.mutate(p.id)}
            />
          ))}
        </div>
      ) : (
        <Card className="py-12">
          <CardContent className="text-center">
            <User className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium mb-2">No personas yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create personas to simulate how different types of respondents would answer your interview questions.
            </p>
            <Button onClick={handleNew} data-testid="button-create-first-persona">
              <Plus className="w-4 h-4 mr-2" />
              Create Persona
            </Button>
          </CardContent>
        </Card>
      )}

      <PersonaFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        persona={editingPersona}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
