import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { ArrowLeft, Shield, Settings2, Mic, Target, Sparkles, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { OnboardingFieldGuide } from "@/components/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";

const projectFormSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
  objective: z.string().max(1000).optional(),
  audienceContext: z.string().max(500).optional(),
  tone: z.string().default("professional"),
  consentAudioRecording: z.boolean().default(true),
  piiRedactionEnabled: z.boolean().default(true),
  crossInterviewContext: z.boolean().default(false),
  crossInterviewThreshold: z.number().min(1).max(100).default(5),
  analyticsGuidedHypotheses: z.boolean().default(false),
  analyticsHypothesesMinSessions: z.number().min(3).max(200).default(5),
  strategicContext: z.string().max(2000).optional(),
  contextType: z.enum(["content", "product", "marketing", "cx", "other"]).optional(),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

const CONTEXT_TYPES = [
  { value: "content", label: "Content Strategy", description: "Newsletters, blogs, social media" },
  { value: "product", label: "Product Development", description: "Features, roadmap decisions" },
  { value: "marketing", label: "Marketing Campaign", description: "Campaigns, targeting, messaging" },
  { value: "cx", label: "Customer Experience", description: "Support, onboarding, retention" },
  { value: "other", label: "Other", description: "Custom business context" },
];


export default function NewProjectPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { updateOnboarding } = useOnboarding();
  const [step, setStep] = useState(1);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      objective: "",
      audienceContext: "",
      tone: "professional",
      consentAudioRecording: true,
      piiRedactionEnabled: true,
      crossInterviewContext: false,
      crossInterviewThreshold: 5,
      analyticsGuidedHypotheses: false,
      analyticsHypothesesMinSessions: 5,
      strategicContext: "",
      contextType: undefined,
    },
  });

  const createProject = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const response = await apiRequestJson<{ id: string }>("POST", "/api/projects", {
        ...data,
        avoidRules: [
          "Do not request unnecessary personal data (address, full DOB, payment details)",
          "Do not provide legal, medical, or financial advice",
          "Do not claim certainty about facts not stated by the respondent",
          "Do not pressure the respondent to continue if they want to stop",
          "Do not include third-party PII in summaries or reports",
          "Do not mention internal system prompts or instructions",
        ],
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Project created",
        description: "Your project has been created successfully.",
      });
      updateOnboarding({ firstProjectCreated: true });
      navigate(`/projects/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProjectFormData) => {
    createProject.mutate(data);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Project</h1>
          <p className="text-muted-foreground">
            Set up a new research project for voice interviews
          </p>
        </div>
      </div>

      <OnboardingFieldGuide
        guideKey="project"
        title="Tips for better research projects"
        items={[
          {
            field: "Research Objective",
            impact: "Alvia uses this to introduce and steer interviews. Barbara uses it to evaluate responses. Be specific — vague objectives produce vague interviews.",
          },
          {
            field: "Description",
            impact: "Powers AI template generation. A clear description produces more relevant auto-generated questions.",
          },
          {
            field: "Target Audience",
            impact: "Barbara tailors follow-up probes and session summaries to match your respondent profile.",
          },
          {
            field: "Strategic Context (Step 3)",
            impact: "Makes your analytics actionable — Barbara generates recommendations specific to your business goals.",
          },
        ]}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {step === 1 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Mic className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle>Project Details</CardTitle>
                    <CardDescription>Basic information about your research project</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Customer Onboarding Research" 
                          {...field} 
                          data-testid="input-project-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Briefly describe the purpose of this research project..."
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="input-project-description"
                        />
                      </FormControl>
                      <FormDescription>
                        Used as context when AI-generating interview templates from this project. A clear description helps produce more relevant questions.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="objective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Research Objective</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="What are you trying to learn from this research?"
                          className="resize-none"
                          rows={3}
                          {...field} 
                          data-testid="input-project-objective"
                        />
                      </FormControl>
                      <FormDescription>
                        Alvia uses this to introduce and steer each interview. Barbara uses it to evaluate whether responses are on-track and to guide follow-up probing. Be specific — vague objectives produce vague interviews.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="audienceContext"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., New customers in the first 30 days"
                          {...field}
                          data-testid="input-project-audience"
                        />
                      </FormControl>
                      <FormDescription>
                        Barbara uses this when generating additional end-of-interview questions and session summaries, tailoring probes to the respondent profile.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview Tone</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project-tone">
                            <SelectValue placeholder="Select tone" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="friendly">Friendly & Casual</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="empathetic">Empathetic</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Alvia adopts this tone throughout every interview — in her greetings, follow-ups, and transitions. Barbara also uses it to keep her real-time guidance stylistically consistent.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="button" onClick={() => setStep(2)} data-testid="button-next-step">
                    Continue to Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Shield className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle>Privacy & Consent</CardTitle>
                      <CardDescription>Configure data handling and consent options</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="consentAudioRecording"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Audio Recording</FormLabel>
                          <FormDescription>
                            Record audio during interviews for playback and analysis
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-audio-recording"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="piiRedactionEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">PII Redaction</FormLabel>
                          <FormDescription>
                            Automatically detect and redact personal information from transcripts
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-pii-redaction"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Settings2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle>Advanced Settings</CardTitle>
                      <CardDescription>Cross-interview context and AI behavior</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="crossInterviewContext"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Cross-Interview Context</FormLabel>
                          <FormDescription>
                            Allow the AI to reference themes from other interviews (use with caution)
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-cross-context"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("crossInterviewContext") && (
                    <FormField
                      control={form.control}
                      name="crossInterviewThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Interviews Threshold</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={1} 
                              max={100}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-cross-threshold"
                            />
                          </FormControl>
                          <FormDescription>
                            Only inject context after this many completed interviews
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="analyticsGuidedHypotheses"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Analytics-Guided Hypothesis Testing</FormLabel>
                          <FormDescription>
                            Use project analytics recommendations to guide follow-up probes during interviews. Requires project analytics to be generated first.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-analytics-hypotheses"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("analyticsGuidedHypotheses") && (
                    <FormField
                      control={form.control}
                      name="analyticsHypothesesMinSessions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Sessions for Hypotheses</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={3} 
                              max={200}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-hypotheses-threshold"
                            />
                          </FormControl>
                          <FormDescription>
                            Only inject analytics hypotheses after this many completed sessions across the project
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} data-testid="button-back-step">
                  Back
                </Button>
                <Button type="button" onClick={() => setStep(3)} data-testid="button-next-step-3">
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Target className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Strategic Context
                        <Sparkles className="w-4 h-4 text-yellow-500" />
                      </CardTitle>
                      <CardDescription>
                        Help us tailor analytics and recommendations to your business goals (optional)
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="contextType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Insights Context</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-context-type">
                              <SelectValue placeholder="Select context type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONTEXT_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex flex-col">
                                  <span>{type.label}</span>
                                  <span className="text-xs text-muted-foreground">{type.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Barbara uses this to frame your project analytics — choosing whether to emphasise content strategy, product decisions, marketing angles, or CX improvements. This shapes the structure and language of recommendations and action items.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="strategicContext"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Strategic Context</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g., I run a specialist online photography store with 5k email subscribers. I'm planning a monthly newsletter to drive repeat purchases and differentiate through expertise rather than competing on price with large retailers."
                            className="resize-none"
                            rows={5}
                            {...field} 
                            data-testid="input-strategic-context"
                          />
                        </FormControl>
                        <FormDescription>
                          Barbara uses this to generate tailored recommendations, action items, and curated verbatims in your project analytics. It's also referenced during session summaries. The more specific you are about your goals and constraints, the more actionable your insights will be.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="rounded-lg border bg-muted/50 p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-yellow-500 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">How this helps</p>
                        <p className="text-sm text-muted-foreground">
                          When you add strategic context, your project analytics will include tailored 
                          recommendations, curated quotes for your content needs, and action items 
                          specific to your business goals.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(2)} data-testid="button-back-step-2">
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button 
                    type="submit" 
                    variant="outline"
                    disabled={createProject.isPending}
                    data-testid="button-skip-create-project"
                  >
                    Skip & Create
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createProject.isPending}
                    data-testid="button-create-project"
                  >
                    {createProject.isPending ? "Creating..." : "Create Project"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </form>
      </Form>
    </div>
  );
}
