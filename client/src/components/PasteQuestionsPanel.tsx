import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  ChevronDown,
  AlertTriangle,
  Check,
  Lightbulb,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson } from "@/lib/queryClient";

interface ParsedQuestion {
  originalText: string;
  questionText: string;
  questionType: "open" | "yes_no" | "scale" | "numeric" | "multi_select";
  guidance: string;
  scaleMin?: number;
  scaleMax?: number;
  multiSelectOptions?: string[];
  timeHintSeconds: number;
  recommendedFollowUps: number;
  confidence: "high" | "medium" | "low";
  confidenceNote?: string;
  possibleDuplicate?: boolean;
  duplicateOf?: string;
}

interface ParseQuestionsResult {
  suggestedObjective?: string;
  questions: ParsedQuestion[];
}

export interface PasteQuestionsPanelProps {
  projectId: string;
  existingQuestions: Array<{ questionText: string }>;
  templateObjective: string;
  onImport: (questions: ParsedQuestion[], mode: "append" | "replace") => void;
  onSuggestObjective: (objective: string) => void;
  onClose: () => void;
}

const questionTypeLabels: Record<string, string> = {
  open: "Open",
  yes_no: "Yes/No",
  scale: "Scale",
  numeric: "Numeric",
  multi_select: "Multi-Select",
};

const confidenceColors: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function PasteQuestionsPanel({
  projectId,
  existingQuestions,
  templateObjective,
  onImport,
  onSuggestObjective,
  onClose,
}: PasteQuestionsPanelProps) {
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<ParseQuestionsResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [editedQuestions, setEditedQuestions] = useState<ParsedQuestion[]>([]);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [objectiveApplied, setObjectiveApplied] = useState(false);

  const parseMutation = useMutation({
    mutationFn: async () => {
      return apiRequestJson<ParseQuestionsResult>(
        "POST",
        `/api/projects/${projectId}/parse-questions`,
        {
          rawText: rawText.replace(/<[^>]*>/g, "").trim(),
          existingQuestions: existingQuestions.map(q => q.questionText).filter(Boolean),
          templateObjective: templateObjective || undefined,
        },
        { timeoutMs: 120000 },
      );
    },
    onSuccess: (data) => {
      setResult(data);
      setEditedQuestions(data.questions.map(q => ({ ...q })));
      setSelectedIndices(new Set(data.questions.map((_, i) => i)));
    },
    onError: (error: Error) => {
      toast({
        title: "Parsing failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleParse = () => {
    if (!rawText.trim()) return;
    setResult(null);
    parseMutation.mutate();
  };

  const toggleQuestion = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const updateQuestion = (index: number, updates: Partial<ParsedQuestion>) => {
    setEditedQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...updates } : q));
  };

  const handleImport = () => {
    const selected = editedQuestions.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;
    onImport(selected, importMode);
    toast({
      title: "Questions imported",
      description: `${selected.length} question${selected.length > 1 ? "s" : ""} added to your template.`,
    });
    onClose();
  };

  const handleApplyObjective = () => {
    if (result?.suggestedObjective) {
      onSuggestObjective(result.suggestedObjective);
      setObjectiveApplied(true);
      toast({ title: "Objective applied", description: "Template objective has been updated." });
    }
  };

  const selectedCount = selectedIndices.size;
  const charCount = rawText.length;

  if (!result && !parseMutation.isPending) {
    return (
      <Card data-testid="paste-questions-panel-input">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder={"Paste your questions here — numbered lists, bullet points, survey exports, or plain text all work.\n\nExamples:\n1. How satisfied are you with our product?\n2. On a scale of 1-10, rate your experience\n3. Which features do you use? (Select all: A, B, C, D)"}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="min-h-[200px] resize-y text-sm"
              maxLength={10000}
              data-testid="textarea-paste-questions"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {charCount.toLocaleString()} / 10,000 characters
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  data-testid="button-cancel-paste"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleParse}
                  disabled={!rawText.trim() || charCount > 10000}
                  data-testid="button-parse-questions"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Parse Questions
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (parseMutation.isPending) {
    return (
      <Card data-testid="paste-questions-panel-loading">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 animate-pulse" />
            Parsing questions...
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2 p-4 border rounded-md">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (result && result.questions.length === 0) {
    return (
      <Card data-testid="paste-questions-panel-empty">
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-sm font-medium">No questions found</p>
          <p className="text-xs text-muted-foreground">
            Try pasting text with clear questions — numbered lists, bullet points, or direct question sentences work best.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} data-testid="button-close-empty">
              Close
            </Button>
            <Button type="button" size="sm" onClick={() => { setResult(null); }} data-testid="button-try-again">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="paste-questions-panel-preview">
      <CardContent className="pt-6 space-y-4">
        {result?.suggestedObjective && !templateObjective && !objectiveApplied && (
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md" data-testid="suggested-objective-banner">
            <Lightbulb className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-xs font-medium">Suggested objective from your pasted content:</p>
              <p className="text-xs text-muted-foreground italic">{result.suggestedObjective}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyObjective}
              data-testid="button-apply-objective"
            >
              Apply
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium" data-testid="text-parsed-count">
            {editedQuestions.length} question{editedQuestions.length !== 1 ? "s" : ""} parsed
            {selectedCount < editedQuestions.length && ` (${selectedCount} selected)`}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch
                checked={importMode === "replace"}
                onCheckedChange={(checked) => setImportMode(checked ? "replace" : "append")}
                data-testid="switch-import-mode"
              />
              Replace existing
            </label>
          </div>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {editedQuestions.map((q, index) => (
            <ParsedQuestionCard
              key={index}
              question={q}
              index={index}
              selected={selectedIndices.has(index)}
              onToggle={() => toggleQuestion(index)}
              onUpdate={(updates) => updateQuestion(index, updates)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setResult(null); }} data-testid="button-back-to-input">
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-preview">
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleImport}
              disabled={selectedCount === 0}
              data-testid="button-import-selected"
            >
              <Check className="w-4 h-4 mr-2" />
              Import {selectedCount} Question{selectedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ParsedQuestionCard({
  question,
  index,
  selected,
  onToggle,
  onUpdate,
}: {
  question: ParsedQuestion;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<ParsedQuestion>) => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div
      className={`border rounded-md p-3 space-y-2 transition-opacity ${!selected ? "opacity-50" : ""}`}
      data-testid={`parsed-question-card-${index}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-1"
          data-testid={`checkbox-question-${index}`}
        />
        <div className="flex-1 min-w-0 space-y-2">
          <Input
            value={question.questionText}
            onChange={(e) => onUpdate({ questionText: e.target.value })}
            className="text-sm"
            data-testid={`input-question-text-${index}`}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={question.questionType}
              onValueChange={(val) => onUpdate({
                questionType: val as ParsedQuestion["questionType"],
                scaleMin: val === "scale" ? (question.scaleMin ?? 1) : undefined,
                scaleMax: val === "scale" ? (question.scaleMax ?? 10) : undefined,
                multiSelectOptions: val === "multi_select" ? (question.multiSelectOptions ?? []) : undefined,
              })}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs" data-testid={`select-question-type-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(questionTypeLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className={`text-xs no-default-hover-elevate no-default-active-elevate cursor-default ${confidenceColors[question.confidence]}`}
                  data-testid={`badge-confidence-${index}`}
                >
                  {question.confidence}
                </Badge>
              </TooltipTrigger>
              {question.confidenceNote && (
                <TooltipContent>
                  <p className="max-w-xs text-xs">{question.confidenceNote}</p>
                </TooltipContent>
              )}
            </Tooltip>

            {question.possibleDuplicate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate cursor-default"
                    data-testid={`badge-duplicate-${index}`}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Possible duplicate
                  </Badge>
                </TooltipTrigger>
                {question.duplicateOf && (
                  <TooltipContent>
                    <p className="max-w-xs text-xs">Similar to: "{question.duplicateOf}"</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </div>

          <Textarea
            value={question.guidance}
            onChange={(e) => onUpdate({ guidance: e.target.value })}
            placeholder="Interviewer guidance..."
            className="text-xs min-h-[48px] resize-none"
            data-testid={`textarea-guidance-${index}`}
          />

          {question.questionType === "scale" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Scale:</span>
              <Input
                type="number"
                value={question.scaleMin ?? 1}
                onChange={(e) => onUpdate({ scaleMin: parseInt(e.target.value) || 1 })}
                className="w-16 h-7 text-xs"
                data-testid={`input-scale-min-${index}`}
              />
              <span>to</span>
              <Input
                type="number"
                value={question.scaleMax ?? 10}
                onChange={(e) => onUpdate({ scaleMax: parseInt(e.target.value) || 10 })}
                className="w-16 h-7 text-xs"
                data-testid={`input-scale-max-${index}`}
              />
            </div>
          )}

          {question.questionType === "multi_select" && question.multiSelectOptions && (
            <div className="text-xs text-muted-foreground" data-testid={`text-options-${index}`}>
              Options: {question.multiSelectOptions.join(", ")}
            </div>
          )}

          <Collapsible open={showOriginal} onOpenChange={setShowOriginal}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`button-toggle-original-${index}`}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showOriginal ? "rotate-180" : ""}`} />
                Original text
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 p-2 bg-muted/50 rounded text-xs text-muted-foreground italic" data-testid={`text-original-${index}`}>
                {question.originalText}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
