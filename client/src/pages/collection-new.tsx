import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Play, Users, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InterviewTemplate, Question } from "@shared/schema";
import { OnboardingFieldGuide } from "@/components/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";

interface TemplateWithQuestions extends InterviewTemplate {
  questions?: Question[];
}

const collectionFormSchema = z.object({
  name: z.string().min(1, "Collection name is required").max(100),
  description: z.string().max(500).optional(),
  targetResponses: z.number().min(1).optional(),
  isOpen: z.boolean().default(true),
  expiresAt: z.string().optional(),
  voiceProvider: z.enum(["openai", "grok"]).default("openai"),
  maxAdditionalQuestions: z.number().min(0).max(3).default(1),
  endOfInterviewSummaryEnabled: z.boolean().default(false),
});

type CollectionFormData = z.infer<typeof collectionFormSchema>;

export default function CollectionNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { updateOnboarding } = useOnboarding();
  
  const searchParams = new URLSearchParams(window.location.search);
  const templateId = searchParams.get("templateId");

  const { data: template, isLoading: templateLoading } = useQuery<TemplateWithQuestions>({
    queryKey: ["/api/templates", templateId],
    enabled: !!templateId,
  });

  const form = useForm<CollectionFormData>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: {
      name: "",
      description: "",
      targetResponses: 50,
      isOpen: true,
      expiresAt: "",
      voiceProvider: "openai",
      maxAdditionalQuestions: 1,
      endOfInterviewSummaryEnabled: false,
    },
  });

  const createCollection = useMutation({
    mutationFn: async (data: CollectionFormData) => {
      const payload = {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : undefined,
      };
      const response = await apiRequest("POST", `/api/templates/${templateId}/collections`, payload);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId, "collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Collection launched",
        description: "Your collection is now live and ready to accept responses.",
      });
      updateOnboarding({ firstCollectionCreated: true });
      navigate(`/collections/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create collection",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CollectionFormData) => {
    createCollection.mutate(data);
  };

  const { data: allTemplates } = useQuery<InterviewTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: !templateId,
  });

  if (!templateId) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6 min-w-0">
        <div className="flex items-center gap-4">
          <Link href="/collections">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Launch Collection</h1>
            <p className="text-muted-foreground">Select a template to create a collection</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select a Template</CardTitle>
            <CardDescription>
              Choose which interview template to use for this collection
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!allTemplates || allTemplates.length === 0 ? (
              <div className="text-center py-8">
                <Play className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-medium mb-2">No templates available</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a template in a project first.
                </p>
                <Link href="/projects">
                  <Button>Go to Projects</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {allTemplates.map((tmpl) => (
                  <Link key={tmpl.id} href={`/collections/new?templateId=${tmpl.id}`}>
                    <div className="flex items-center justify-between p-4 rounded-lg border hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium">{tmpl.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {tmpl.objective || "No objective set"}
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        Select
                      </Button>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (templateLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6 min-w-0">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto min-w-0">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Template not found</h3>
            <p className="text-muted-foreground mb-4">
              The template you're looking for doesn't exist.
            </p>
            <Link href="/projects">
              <Button>Browse Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questionCount = template.questions?.length || 0;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6 min-w-0">
      <div className="flex items-center gap-4">
        <Link href={`/templates/${templateId}`}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Launch Collection</h1>
          <p className="text-muted-foreground">
            Create a new collection from "{template.name}"
          </p>
        </div>
      </div>

      <OnboardingFieldGuide
        guideKey="collection"
        title="Tips for launching collections"
        items={[
          {
            field: "Additional Questions (0-3)",
            impact: "After scripted questions, Barbara generates dynamic follow-ups to explore gaps. More = richer data.",
          },
          {
            field: "End-of-Interview Summary",
            impact: "Barbara generates per-session insights that feed into collection and project analytics.",
          },
          {
            field: "Target Responses",
            impact: "Sets your collection goal. Analytics become more reliable with more completed interviews.",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Questions</p>
                <p className="font-medium">{questionCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Duration</p>
                <p className="font-medium">
                  {Math.ceil((template.questions || []).reduce((sum, q) => sum + (q.timeHintSeconds || 60), 0) / 60)} min
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Collection Details</CardTitle>
              <CardDescription>
                Configure how this collection will accept responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Collection Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Q1 2026 User Research" 
                        {...field} 
                        data-testid="input-collection-name"
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
                        placeholder="Optional description for this collection"
                        className="resize-none"
                        rows={2}
                        {...field} 
                        data-testid="input-collection-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="voiceProvider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voice Provider</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled>
                      <FormControl>
                        <SelectTrigger data-testid="select-voice-provider">
                          <SelectValue placeholder="Select voice provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai" data-testid="option-openai">OpenAI</SelectItem>
                        <SelectItem value="grok" data-testid="option-grok">Grok (xAI)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      The AI voice service used for interviews in this collection
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxAdditionalQuestions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Questions</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(parseInt(val))} 
                      value={field.value?.toString() ?? "1"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-additional-questions">
                          <SelectValue placeholder="Select number" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0" data-testid="option-aq-0">0 (disabled)</SelectItem>
                        <SelectItem value="1" data-testid="option-aq-1">1 question</SelectItem>
                        <SelectItem value="2" data-testid="option-aq-2">2 questions</SelectItem>
                        <SelectItem value="3" data-testid="option-aq-3">3 questions</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      After all scripted questions, Barbara analyses the full transcript and generates up to this many additional questions to explore gaps or emerging themes. Alvia then asks them in the same conversational tone. Set to 0 to skip this phase entirely.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="targetResponses"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Responses</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          min={1}
                          placeholder="50"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          data-testid="input-target-responses"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        How many responses do you want to collect?
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires At</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local"
                          {...field}
                          data-testid="input-expires-at"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Optional end date for the collection
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isOpen"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Open for Responses</FormLabel>
                      <FormDescription className="text-xs">
                        Collection is immediately accepting responses
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-open"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endOfInterviewSummaryEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>End-of-Interview Summary</FormLabel>
                      <FormDescription className="text-xs">
                        When enabled, Barbara generates a structured summary after each interview using your research objective and strategic context. This produces per-session insights that feed into collection and project analytics.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-end-of-interview-summary"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href={`/templates/${templateId}`}>
              <Button type="button" variant="outline" data-testid="button-cancel">
                Cancel
              </Button>
            </Link>
            <Button 
              type="submit" 
              disabled={createCollection.isPending}
              data-testid="button-launch-collection"
            >
              <Play className="w-4 h-4 mr-2" />
              {createCollection.isPending ? "Launching..." : "Launch Collection"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
