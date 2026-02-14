import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  Trash2,
  MessageSquare,
  ToggleLeft,
  Gauge,
  Hash,
  List,
  Save,
  ClipboardPaste,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import type { Project, InterviewTemplate, Question } from "@shared/schema";
import { OnboardingFieldGuide } from "@/components/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";
import { PasteQuestionsPanel } from "@/components/PasteQuestionsPanel";

const questionTypeIcons: Record<string, React.ElementType> = {
  open: MessageSquare,
  yes_no: ToggleLeft,
  scale: Gauge,
  numeric: Hash,
  multi_select: List,
};

const questionTypeLabels: Record<string, string> = {
  open: "Open Response",
  yes_no: "Yes/No",
  scale: "Scale Rating",
  numeric: "Numeric",
  multi_select: "Multi-Select",
};

const questionSchema = z.object({
  questionText: z.string().min(1, "Question text is required"),
  questionType: z.enum(["open", "yes_no", "scale", "numeric", "multi_select"]),
  guidance: z.string().optional(),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  multiSelectOptions: z.array(z.string()).optional(),
  timeHintSeconds: z.number().optional(),
  recommendedFollowUps: z.number().min(0).max(10).optional(),
  isRequired: z.boolean().default(true),
});

const templateFormSchema = z.object({
  name: z.string().min(1, "Template name is required").max(100),
  objective: z.string().max(1000).optional(),
  tone: z.string().optional(),
  constraints: z.string().optional(),
  defaultRecommendedFollowUps: z.number().min(0).max(10).optional(),
  questions: z
    .array(questionSchema)
    .min(1, "At least one question is required"),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

interface TemplateWithQuestions extends InterviewTemplate {
  questions?: Question[];
}

function QuestionCard({
  index,
  question,
  onRemove,
  form,
}: {
  index: number;
  question: any;
  onRemove: () => void;
  form: any;
}) {
  const questionType = form.watch(`questions.${index}.questionType`);
  const Icon = questionTypeIcons[questionType] || MessageSquare;

  return (
    <Card className="relative group" data-testid={`card-question-${index}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="cursor-grab mt-1 text-muted-foreground hover:text-foreground">
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="gap-1">
                <Icon className="w-3 h-3" />
                {questionTypeLabels[questionType]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Question {index + 1}
              </span>
            </div>

            <FormField
              control={form.control}
              name={`questions.${index}.questionText`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the question Alvia will ask the respondent..."
                      className="resize-none text-base font-medium border-0 p-0 focus-visible:ring-0 shadow-none"
                      rows={2}
                      {...field}
                      data-testid={`input-question-text-${index}`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            data-testid={`button-remove-question-${index}`}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name={`questions.${index}.questionType`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Question Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger
                      data-testid={`select-question-type-${index}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="open">Open Response</SelectItem>
                    <SelectItem value="yes_no">Yes/No</SelectItem>
                    <SelectItem value="scale">Scale Rating</SelectItem>
                    <SelectItem value="numeric">Numeric</SelectItem>
                    <SelectItem value="multi_select">Multi-Select</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`questions.${index}.timeHintSeconds`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Time Hint (seconds)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Optional"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseInt(e.target.value) : undefined,
                      )
                    }
                    data-testid={`input-time-hint-${index}`}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {questionType === "scale" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name={`questions.${index}.scaleMin`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Min Value</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="1"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      data-testid={`input-scale-min-${index}`}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`questions.${index}.scaleMax`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Max Value</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="10"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      data-testid={`input-scale-max-${index}`}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name={`questions.${index}.guidance`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Interviewer Guidance</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="What makes a good answer? What should the AI probe for?"
                  className="resize-none bg-muted/50 text-sm"
                  rows={2}
                  {...field}
                  value={field.value ?? ""}
                  data-testid={`input-guidance-${index}`}
                />
              </FormControl>
              <FormDescription className="text-xs">
                Alvia sees this as her briefing for each question — it tells her
                what a good answer looks like and what to probe for. Barbara
                uses it to evaluate whether the respondent has covered enough
                ground before moving on.
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`questions.${index}.recommendedFollowUps`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Follow-up Depth</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  placeholder="Use template default"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  className="w-40"
                  data-testid={`input-recommended-followups-${index}`}
                />
              </FormControl>
              <FormDescription className="text-xs">
                How many follow-up probes Alvia should attempt for this question
                before Barbara signals to move on. Leave blank to use the
                template default.
              </FormDescription>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}

export default function TemplateBuilderPage() {
  const params = useParams<{ projectId?: string; id?: string }>();
  const isEditMode = !!params.id;
  const templateId = params.id;
  const projectIdFromParams = params.projectId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { updateOnboarding } = useOnboarding();

  const { data: existingTemplate, isLoading: templateLoading } =
    useQuery<TemplateWithQuestions>({
      queryKey: ["/api/templates", templateId],
      enabled: isEditMode && !!templateId,
    });

  const projectId = isEditMode
    ? existingTemplate?.projectId
    : projectIdFromParams;

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      objective: "",
      tone: "professional",
      constraints: "",
      questions: [
        {
          questionText: "",
          questionType: "open",
          guidance: "",
          isRequired: true,
        },
      ],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  useEffect(() => {
    if (isEditMode && existingTemplate) {
      const questions = existingTemplate.questions || [];

      form.reset({
        name: existingTemplate.name,
        objective: existingTemplate.objective || "",
        tone: existingTemplate.tone || "professional",
        constraints: existingTemplate.constraints || "",
        defaultRecommendedFollowUps:
          existingTemplate.defaultRecommendedFollowUps ?? undefined,
        questions: [],
      });

      const mappedQuestions =
        questions.length > 0
          ? questions.map((q) => ({
              questionText: q.questionText,
              questionType: q.questionType as
                | "open"
                | "yes_no"
                | "scale"
                | "numeric"
                | "multi_select",
              guidance: q.guidance || "",
              scaleMin: q.scaleMin ?? undefined,
              scaleMax: q.scaleMax ?? undefined,
              multiSelectOptions: q.multiSelectOptions || undefined,
              timeHintSeconds: q.timeHintSeconds ?? undefined,
              recommendedFollowUps: q.recommendedFollowUps ?? undefined,
              isRequired: q.isRequired ?? true,
            }))
          : [
              {
                questionText: "",
                questionType: "open" as const,
                guidance: "",
                isRequired: true,
              },
            ];

      replace(mappedQuestions);
    }
  }, [existingTemplate, isEditMode]);

  const createTemplate = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      return apiRequestJson<InterviewTemplate>(
        "POST",
        `/api/projects/${projectId}/templates`,
        data,
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "templates"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Template created",
        description: "Your interview template has been created successfully.",
      });
      updateOnboarding({ firstTemplateCreated: true });
      navigate(`/templates/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      return apiRequestJson<InterviewTemplate>(
        "PATCH",
        `/api/templates/${templateId}`,
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/templates", templateId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "templates"],
      });
      toast({
        title: "Template updated",
        description: "Your interview template has been updated successfully.",
      });
      navigate(`/templates/${templateId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TemplateFormData) => {
    if (isEditMode) {
      updateTemplate.mutate(data);
    } else {
      createTemplate.mutate(data);
    }
  };

  const addQuestion = () => {
    append({
      questionText: "",
      questionType: "open",
      guidance: "",
      isRequired: true,
    });
  };

  const [showPastePanel, setShowPastePanel] = useState(false);

  const handlePasteImport = (questions: Array<{
    questionText: string;
    questionType: "open" | "yes_no" | "scale" | "numeric" | "multi_select";
    guidance: string;
    scaleMin?: number;
    scaleMax?: number;
    multiSelectOptions?: string[];
    timeHintSeconds: number;
    recommendedFollowUps: number;
  }>, mode: "append" | "replace") => {
    const mapped = questions.map(q => ({
      questionText: q.questionText,
      questionType: q.questionType,
      guidance: q.guidance,
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      multiSelectOptions: q.multiSelectOptions,
      timeHintSeconds: q.timeHintSeconds,
      recommendedFollowUps: q.recommendedFollowUps,
      isRequired: true,
    }));

    if (mode === "replace") {
      replace(mapped);
    } else {
      const currentQuestions = form.getValues("questions");
      const isOnlyDefaultBlank = currentQuestions.length === 1
        && currentQuestions[0].questionText.trim() === "";

      if (isOnlyDefaultBlank) {
        replace(mapped);
      } else {
        mapped.forEach(q => append(q));
      }
    }
  };

  const handleSuggestObjective = (objective: string) => {
    form.setValue("objective", objective);
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;
  const backLink = isEditMode
    ? `/templates/${templateId}`
    : `/projects/${projectId}`;

  if (isEditMode && templateLoading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 min-w-0">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 min-w-0">
      <div className="flex items-center gap-4">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditMode ? "Edit Template" : "Create Template"}
          </h1>
          <p className="text-muted-foreground">
            {project?.name || "Loading..."}
          </p>
        </div>
      </div>

      {!isEditMode && (
        <OnboardingFieldGuide
          guideKey="template"
          title="Tips for effective interview templates"
          items={[
            {
              field: "Interview Objective",
              impact: "THE most important field. Alvia uses it to introduce the interview; Barbara uses it to judge follow-up quality.",
            },
            {
              field: "Question Guidance",
              impact: "Alvia's briefing for each question — tells her what a good answer looks like and what to probe for.",
            },
            {
              field: "Follow-up Depth",
              impact: "Controls how many probing questions Alvia attempts before Barbara signals to move on.",
            },
          ]}
          tip="Use 'Generate Template' on your project page to auto-create questions from your research objectives."
        />
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template Details</CardTitle>
              <CardDescription>
                Basic information about this interview template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., New User Onboarding Interview"
                        {...field}
                        data-testid="input-template-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interview Objective</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What is the goal of this interview?"
                        className="resize-none"
                        rows={2}
                        {...field}
                        data-testid="input-template-objective"
                      />
                    </FormControl>
                    <FormDescription>
                      Alvia uses this to introduce the interview to each
                      respondent and to decide when a question has been
                      sufficiently explored. Barbara references it in real-time
                      to judge whether follow-up probing is on-track.{" "}
                      <strong>
                        This is the single most important field for interview
                        quality.
                      </strong>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview Tone</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-template-tone">
                            <SelectValue placeholder="Select tone" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="professional">
                            Professional
                          </SelectItem>
                          <SelectItem value="friendly">
                            Friendly & Casual
                          </SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="empathetic">Empathetic</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        Alvia adopts this tone throughout the interview — from
                        greeting through to wrap-up. Barbara's real-time
                        guidance also respects this tone when suggesting how
                        Alvia should probe or transition.
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultRecommendedFollowUps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Follow-up Depth</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          placeholder="No limit"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? parseInt(e.target.value)
                                : undefined,
                            )
                          }
                          data-testid="input-default-followups"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Sets the default number of follow-up probes Alvia will
                        attempt per question. Individual questions can override
                        this. Barbara uses this to judge when Alvia has probed
                        enough and should move on. '0' means Alvia asks only the
                        scripted question with no follow-ups.
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="constraints"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Constraints</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any topics or areas to avoid?"
                        className="resize-none"
                        rows={2}
                        {...field}
                        data-testid="input-template-constraints"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Questions</h2>
                <p className="text-sm text-muted-foreground">
                  Add and configure your interview questions
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPastePanel(!showPastePanel)}
                  data-testid="button-paste-questions"
                >
                  <ClipboardPaste className="w-4 h-4 mr-2" />
                  {showPastePanel ? "Cancel" : "Paste Questions"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addQuestion}
                  data-testid="button-add-question"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Question
                </Button>
              </div>
            </div>

            {showPastePanel && projectId && (
              <PasteQuestionsPanel
                projectId={projectId}
                existingQuestions={fields.map(f => ({ questionText: ((f as any).questionText || "").trim() })).filter(q => q.questionText.length > 0)}
                templateObjective={form.getValues("objective") || ""}
                onImport={handlePasteImport}
                onSuggestObjective={handleSuggestObjective}
                onClose={() => setShowPastePanel(false)}
              />
            )}

            <div className="space-y-4">
              {fields.map((field, index) => (
                <QuestionCard
                  key={field.id}
                  index={index}
                  question={field}
                  onRemove={() => remove(index)}
                  form={form}
                />
              ))}
            </div>

            {fields.length === 0 && (
              <Card className="py-12">
                <CardContent className="text-center">
                  <MessageSquare className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-medium mb-2">No questions yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add your first question to start building your interview.
                  </p>
                  <Button
                    type="button"
                    onClick={addQuestion}
                    data-testid="button-add-first-question"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Question
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-6 border-t">
            <Link href={backLink}>
              <Button
                type="button"
                variant="outline"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="button-save-template"
            >
              <Save className="w-4 h-4 mr-2" />
              {isPending
                ? "Saving..."
                : isEditMode
                  ? "Update Template"
                  : "Save Template"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
