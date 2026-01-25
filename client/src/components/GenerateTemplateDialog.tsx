import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
  CheckCircle,
  List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";

interface GeneratedQuestion {
  questionText: string;
  questionType: "open" | "yes_no" | "scale" | "numeric" | "multi_select";
  guidance: string;
  scaleMin?: number;
  scaleMax?: number;
  multiSelectOptions?: string[];
  timeHintSeconds?: number;
  recommendedFollowUps?: number;
}

interface GeneratedTemplate {
  name: string;
  objective: string;
  tone: string;
  questions: GeneratedQuestion[];
}

interface GenerateTemplateDialogProps {
  projectId: string;
  projectName: string;
  hasProjectMetadata: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const questionTypeLabels: Record<string, string> = {
  open: "Open-ended",
  yes_no: "Yes/No",
  scale: "Scale",
  numeric: "Numeric",
  multi_select: "Multi-select",
};

const questionTypeIcons: Record<string, typeof MessageSquare> = {
  open: MessageSquare,
  yes_no: CheckCircle,
  scale: List,
  numeric: List,
  multi_select: List,
};

export function GenerateTemplateDialog({
  projectId,
  projectName,
  hasProjectMetadata,
  open,
  onOpenChange,
}: GenerateTemplateDialogProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [generatedTemplate, setGeneratedTemplate] = useState<GeneratedTemplate | null>(null);
  const [editedName, setEditedName] = useState("");

  const generateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequestJson<GeneratedTemplate>(
        "POST",
        `/api/projects/${projectId}/generate-template`
      );
    },
    onSuccess: (data) => {
      setGeneratedTemplate(data);
      setEditedName(data.name);
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!generatedTemplate) throw new Error("No template to create");
      
      const templateData = {
        name: editedName || generatedTemplate.name,
        objective: generatedTemplate.objective,
        tone: generatedTemplate.tone,
        questions: generatedTemplate.questions.map((q, index) => ({
          orderIndex: index,
          questionText: q.questionText,
          questionType: q.questionType,
          guidance: q.guidance,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
          multiSelectOptions: q.multiSelectOptions,
          timeHintSeconds: q.timeHintSeconds,
          recommendedFollowUps: q.recommendedFollowUps,
          isRequired: true,
        })),
      };

      return await apiRequestJson<{ id: string }>(
        "POST",
        `/api/projects/${projectId}/templates`,
        templateData
      );
    },
    onSuccess: (data) => {
      toast({
        title: "Template created",
        description: "Redirecting to editor...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "templates"] });
      onOpenChange(false);
      setLocation(`/templates/${data.id}/edit`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create template",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    setGeneratedTemplate(null);
    generateMutation.mutate();
  };

  const handleCreate = () => {
    createMutation.mutate();
  };

  const handleClose = () => {
    setGeneratedTemplate(null);
    setEditedName("");
    onOpenChange(false);
  };

  const isGenerating = generateMutation.isPending;
  const isCreating = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate Template with AI
          </DialogTitle>
          <DialogDescription>
            Create an interview template based on your project's research objectives and context.
          </DialogDescription>
        </DialogHeader>

        {!hasProjectMetadata && !generatedTemplate && !isGenerating && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">Limited project context</p>
              <p className="text-muted-foreground">
                Your project has minimal metadata. Add description, research objectives, or target audience for better results.
              </p>
            </div>
          </div>
        )}

        {!generatedTemplate && !isGenerating && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-medium">Ready to generate</p>
              <p className="text-sm text-muted-foreground">
                AI will create 5-8 questions tailored to "{projectName}"
              </p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <p className="font-medium">Generating template...</p>
            </div>
            <div className="space-y-3 px-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <div className="space-y-2 pt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </div>
        )}

        {generatedTemplate && !isGenerating && (
          <div className="flex-1 min-h-0 space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Enter template name"
                  data-testid="input-template-name"
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Tone:</span>
                <Badge variant="outline">{generatedTemplate.tone}</Badge>
                <span className="text-muted-foreground ml-2">Questions:</span>
                <Badge variant="outline">{generatedTemplate.questions.length}</Badge>
              </div>
              {generatedTemplate.objective && (
                <p className="text-sm text-muted-foreground">{generatedTemplate.objective}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Generated Questions</Label>
              <ScrollArea className="h-[280px] rounded-md border">
                <div className="p-3 space-y-2">
                  {generatedTemplate.questions.map((question, index) => {
                    const Icon = questionTypeIcons[question.questionType] || MessageSquare;
                    return (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 space-y-1.5"
                        data-testid={`preview-question-${index}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">
                            Q{index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{question.questionText}</p>
                            {question.guidance && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Guidance: {question.guidance}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                            <Icon className="w-3 h-3" />
                            {questionTypeLabels[question.questionType]}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can edit questions in detail after creating the template.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {!generatedTemplate && !isGenerating && (
            <>
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel-generate">
                Cancel
              </Button>
              <Button onClick={handleGenerate} data-testid="button-start-generate">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </Button>
            </>
          )}

          {isGenerating && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {generatedTemplate && !isGenerating && (
            <>
              <Button 
                variant="outline" 
                onClick={handleGenerate}
                disabled={isCreating}
                data-testid="button-regenerate"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
              <Button variant="outline" onClick={handleClose} disabled={isCreating}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={isCreating || !editedName.trim()}
                data-testid="button-create-template"
              >
                {isCreating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Create Template
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
