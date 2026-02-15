import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  User,
  ChevronDown,
  Check,
  X,
  Globe,
  Search,
  Upload,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { PopulationBrief, GeneratedPersona } from "@shared/types/persona-generation";

interface ResearchResponse {
  briefId: string;
  brief: PopulationBrief;
  citations: Array<{ url: string; title: string }>;
  ungrounded?: boolean;
}

interface SynthesizeResponse {
  personas: GeneratedPersona[];
  validationWarnings?: string[];
}

interface GeneratePersonasDialogProps {
  projectId: string;
  hasProjectMetadata: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogState = "input" | "researching" | "synthesizing" | "review";

const ATTITUDE_LABELS: Record<string, string> = {
  cooperative: "Cooperative",
  reluctant: "Reluctant",
  neutral: "Neutral",
  evasive: "Evasive",
  enthusiastic: "Enthusiastic",
};

const DOMAIN_LABELS: Record<string, string> = {
  none: "No Knowledge",
  basic: "Basic",
  intermediate: "Intermediate",
  expert: "Expert",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-600 dark:text-green-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
};

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [".csv", ".txt", ".pdf"];

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function GeneratePersonasDialog({
  projectId,
  hasProjectMetadata,
  open,
  onOpenChange,
}: GeneratePersonasDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<DialogState>("input");
  const [researchPrompt, setResearchPrompt] = useState("");
  const [personaCount, setPersonaCount] = useState("5");
  const [diversityMode, setDiversityMode] = useState("balanced");
  const [edgeCases, setEdgeCases] = useState(false);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [brief, setBrief] = useState<PopulationBrief | null>(null);
  const [generatedPersonas, setGeneratedPersonas] = useState<GeneratedPersona[]>([]);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileData, setUploadedFileData] = useState<string | null>(null);
  const [uploadedFileMimeType, setUploadedFileMimeType] = useState<string | null>(null);
  const [isUngrounded, setIsUngrounded] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_FILE_TYPES.includes(ext)) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a CSV, TXT, or PDF file.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum file size is 2MB.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const base64 = await readFileAsBase64(file);
      setUploadedFileData(base64);
      setUploadedFileName(file.name);
      setUploadedFileMimeType(MIME_TYPES[ext] ?? "application/octet-stream");
    } catch {
      toast({
        title: "Failed to read file",
        description: "Could not read the uploaded file.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = () => {
    setUploadedFileName(null);
    setUploadedFileData(null);
    setUploadedFileMimeType(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const researchMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { researchPrompt };
      if (uploadedFileData && uploadedFileName && uploadedFileMimeType) {
        body.uploadedFile = {
          data: uploadedFileData,
          fileName: uploadedFileName,
          mimeType: uploadedFileMimeType,
        };
      }
      return await apiRequestJson<ResearchResponse>(
        "POST",
        `/api/projects/${projectId}/personas/research`,
        body,
        { timeoutMs: 120000 },
      );
    },
    onSuccess: (data) => {
      setBriefId(data.briefId);
      setBrief(data.brief);
      setIsUngrounded(data.ungrounded ?? false);
      setDialogState("synthesizing");
      synthesizeMutation.mutate();
    },
    onError: (error: Error) => {
      setDialogState("input");
      toast({
        title: "Research failed",
        description: error.message || "Please try again with a different prompt.",
        variant: "destructive",
      });
    },
  });

  const synthesizeMutation = useMutation({
    mutationFn: async () => {
      if (!briefId && !researchMutation.data?.briefId) throw new Error("No research data");
      const id = briefId ?? researchMutation.data!.briefId;
      return await apiRequestJson<SynthesizeResponse>(
        "POST",
        `/api/projects/${projectId}/personas/synthesize`,
        {
          briefId: id,
          personaCount: parseInt(personaCount),
          diversityMode,
          edgeCases,
        },
        { timeoutMs: 90000 },
      );
    },
    onSuccess: (data) => {
      setGeneratedPersonas(data.personas);
      setRemovedIndices(new Set());
      setValidationWarnings(data.validationWarnings ?? []);
      setDialogState("review");
    },
    onError: (error: Error) => {
      setDialogState("review");
      toast({
        title: "Persona generation failed",
        description: error.message || "Please try regenerating.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toSave = generatedPersonas.filter((_, i) => !removedIndices.has(i));
      const results = [];
      for (const persona of toSave) {
        const res = await apiRequest("POST", `/api/projects/${projectId}/personas`, {
          name: persona.name,
          description: persona.description,
          ageRange: persona.ageRange,
          gender: persona.gender,
          occupation: persona.occupation,
          location: persona.location,
          attitude: persona.attitude,
          verbosity: persona.verbosity,
          domainKnowledge: persona.domainKnowledge,
          traits: persona.traits,
          communicationStyle: persona.communicationStyle,
          backgroundStory: persona.backgroundStory,
          topicsToAvoid: persona.topicsToAvoid,
          biases: persona.biases,
        });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "personas"] });
      toast({ title: `${data.length} personas saved` });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save personas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    setDialogState("researching");
    setGeneratedPersonas([]);
    setRemovedIndices(new Set());
    setBrief(null);
    setBriefId(null);
    setIsUngrounded(false);
    setValidationWarnings([]);
    researchMutation.mutate();
  };

  const handleRegenerate = () => {
    setDialogState("synthesizing");
    setGeneratedPersonas([]);
    setRemovedIndices(new Set());
    setValidationWarnings([]);
    synthesizeMutation.mutate();
  };

  const handleRemovePersona = (index: number) => {
    setRemovedIndices((prev) => new Set([...prev, index]));
  };

  const handleClose = () => {
    setDialogState("input");
    setResearchPrompt("");
    setPersonaCount("5");
    setDiversityMode("balanced");
    setEdgeCases(false);
    setBriefId(null);
    setBrief(null);
    setGeneratedPersonas([]);
    setRemovedIndices(new Set());
    setBriefExpanded(false);
    setUploadedFileName(null);
    setUploadedFileData(null);
    setUploadedFileMimeType(null);
    setIsUngrounded(false);
    setValidationWarnings([]);
    onOpenChange(false);
  };

  const activePersonas = generatedPersonas.filter((_, i) => !removedIndices.has(i));
  const isPromptValid = researchPrompt.trim().length >= 20;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate Personas with AI
          </DialogTitle>
          <DialogDescription>
            Research your target population and generate diverse, grounded personas for simulation.
          </DialogDescription>
        </DialogHeader>

        {dialogState === "input" && (
          <>
            {!hasProjectMetadata && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Limited project context
                  </p>
                  <p className="text-muted-foreground">
                    Add research objectives or audience context to your project for better results.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="research-prompt">Describe your target population</Label>
                <Textarea
                  id="research-prompt"
                  value={researchPrompt}
                  onChange={(e) => setResearchPrompt(e.target.value)}
                  placeholder="e.g., Urban millennials (25-35) in Southeast Asia who use ride-hailing apps daily for commuting. Mix of white-collar workers and gig economy participants."
                  className="min-h-[100px] resize-none"
                  maxLength={2000}
                  data-testid="input-research-prompt"
                />
                <p className="text-xs text-muted-foreground">
                  {researchPrompt.length}/2000 characters (minimum 20)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Upload supporting document (optional)</Label>
                <div className="flex items-center gap-2">
                  {uploadedFileName ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[200px]">{uploadedFileName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={handleRemoveFile}
                        data-testid="button-remove-file"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload-file"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload File
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    data-testid="input-file-upload"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  CSV, TXT, or PDF up to 2MB. Content is used as additional research context.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Persona count</Label>
                  <Select value={personaCount} onValueChange={setPersonaCount}>
                    <SelectTrigger className="w-[80px]" data-testid="select-persona-count">
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
                    <SelectTrigger className="w-[130px]" data-testid="select-diversity-mode">
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
                    id="edge-cases"
                    checked={edgeCases}
                    onCheckedChange={setEdgeCases}
                    data-testid="switch-edge-cases"
                  />
                  <Label htmlFor="edge-cases" className="text-sm">Edge cases</Label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel-generate">
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!isPromptValid}
                data-testid="button-start-generate"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </Button>
            </DialogFooter>
          </>
        )}

        {(dialogState === "researching" || dialogState === "synthesizing") && (
          <div className="py-8 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {dialogState === "researching" ? (
                  <Search className="w-5 h-5 animate-pulse text-primary" />
                ) : (
                  <Check className="w-5 h-5 text-green-500" />
                )}
                <div>
                  <p className="font-medium">
                    Phase 1: Researching population
                  </p>
                  {brief && (
                    <p className="text-sm text-muted-foreground">
                      {brief.sources.length} sources found, confidence:{" "}
                      <span className={CONFIDENCE_COLORS[brief.confidence]}>{brief.confidence}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {dialogState === "synthesizing" ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-muted" />
                )}
                <p className={`font-medium ${dialogState === "researching" ? "text-muted-foreground" : ""}`}>
                  Phase 2: Generating {personaCount} personas
                </p>
              </div>
            </div>

            {dialogState === "researching" && (
              <div className="space-y-3 px-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {dialogState === "synthesizing" && (
              <div className="space-y-2 px-4">
                {Array.from({ length: parseInt(personaCount) }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
          </div>
        )}

        {dialogState === "review" && (
          <div className="flex-1 min-h-0 space-y-3">
            {isUngrounded && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Limited web research
                  </p>
                  <p className="text-muted-foreground">
                    Web search returned limited results. Personas are based on general knowledge and may not fully reflect current population data.
                  </p>
                </div>
              </div>
            )}

            {validationWarnings.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Diversity check warnings
                  </p>
                  <p className="text-muted-foreground">
                    Some personas may lack diversity. Consider regenerating or manually adjusting after saving.
                  </p>
                </div>
              </div>
            )}

            {brief && (
              <Collapsible open={briefExpanded} onOpenChange={setBriefExpanded}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between"
                    data-testid="button-toggle-brief"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4" />
                      Population Brief
                      <Badge variant="outline" className="text-xs">
                        {brief.sources.length} sources
                      </Badge>
                      <span className={`text-xs ${CONFIDENCE_COLORS[brief.confidence]}`}>
                        {brief.confidence} confidence
                      </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${briefExpanded ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 rounded-md bg-muted/50 space-y-2 text-sm">
                    <p className="font-medium">{brief.targetPopulation}</p>
                    <p className="text-muted-foreground">{brief.demographics.summary}</p>
                    {brief.sources.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-xs font-medium text-muted-foreground">Sources:</p>
                        {brief.sources.slice(0, 5).map((s, i) => (
                          <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-primary hover:underline truncate"
                            data-testid={`link-source-${i}`}
                          >
                            {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <ScrollArea className="flex-1 max-h-[40vh]">
              <div className="space-y-2 pr-3">
                {generatedPersonas.map((persona, index) => {
                  if (removedIndices.has(index)) return null;
                  return (
                    <Card key={index} data-testid={`card-generated-persona-${index}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{persona.name}</span>
                                {persona.ageRange && (
                                  <span className="text-xs text-muted-foreground">{persona.ageRange}</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {persona.occupation} {persona.location ? `\u00b7 ${persona.location}` : ""}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="secondary" className="text-xs">
                                  {ATTITUDE_LABELS[persona.attitude] || persona.attitude}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {persona.verbosity}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {DOMAIN_LABELS[persona.domainKnowledge] || persona.domainKnowledge}
                                </Badge>
                              </div>
                              {persona.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 pt-0.5">{persona.description}</p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePersona(index)}
                            className="shrink-0"
                            data-testid={`button-remove-persona-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            <DialogFooter className="gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={synthesizeMutation.isPending}
                data-testid="button-regenerate-personas"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${synthesizeMutation.isPending ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel-review">
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={activePersonas.length === 0 || saveMutation.isPending}
                data-testid="button-save-personas"
              >
                {saveMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save {activePersonas.length} Persona{activePersonas.length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
