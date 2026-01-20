import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { ArrowLeft, Mic, Shield, Settings2, Target, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

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

export default function ProjectEditPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("details");

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

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
      strategicContext: "",
      contextType: undefined,
    },
  });

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name || "",
        description: project.description || "",
        objective: project.objective || "",
        audienceContext: project.audienceContext || "",
        tone: project.tone || "professional",
        consentAudioRecording: project.consentAudioRecording ?? true,
        piiRedactionEnabled: project.piiRedactionEnabled ?? true,
        crossInterviewContext: project.crossInterviewContext ?? false,
        crossInterviewThreshold: project.crossInterviewThreshold ?? 5,
        strategicContext: project.strategicContext || "",
        contextType: project.contextType || undefined,
      });
    }
  }, [project, form]);

  const updateProject = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const response = await apiRequest("PATCH", `/api/projects/${projectId}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project updated",
        description: "Your changes have been saved.",
      });
      navigate(`/projects/${projectId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProjectFormData) => {
    updateProject.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Project not found</h3>
            <p className="text-muted-foreground mb-4">
              The project you're looking for doesn't exist.
            </p>
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabs = [
    { id: "details", label: "Details", icon: Mic },
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "advanced", label: "Advanced", icon: Settings2 },
    { id: "strategic", label: "Strategic Context", icon: Target },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Project</h1>
          <p className="text-muted-foreground">{project.name}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-4">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {activeTab === "details" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-primary" />
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
                        This helps the AI interviewer understand context and ask better follow-up questions.
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
                        Sets the conversational style of the AI interviewer.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {activeTab === "privacy" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
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
          )}

          {activeTab === "advanced" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Settings2 className="w-5 h-5 text-primary" />
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Cross-Interview Context</FormLabel>
                        <FormDescription>
                          Allow the AI to reference themes from other interviews
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
              </CardContent>
            </Card>
          )}

          {activeTab === "strategic" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Strategic Context
                      <Sparkles className="w-4 h-4 text-primary" />
                    </CardTitle>
                    <CardDescription>
                      Help us tailor analytics and recommendations to your business goals
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
                      <FormLabel>What will you use these insights for?</FormLabel>
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
                        This helps us frame recommendations for your specific use case.
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
                      <FormLabel>Tell us about your business context</FormLabel>
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
                        Include your business goals, constraints, and what decisions these insights will inform. 
                        The more detail you provide, the more tailored your analytics will be.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary mt-0.5" />
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
          )}

          <div className="flex justify-between">
            <Link href={`/projects/${projectId}`}>
              <Button type="button" variant="outline" data-testid="button-cancel">
                Cancel
              </Button>
            </Link>
            <Button 
              type="submit" 
              disabled={updateProject.isPending}
              data-testid="button-save-project"
            >
              {updateProject.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
