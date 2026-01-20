import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Plus, 
  Settings, 
  Play,
  MessageSquare,
  ToggleLeft,
  Gauge,
  Hash,
  List,
  Clock,
  CheckCircle2,
  BarChart3
} from "lucide-react";
import { TemplateAnalyticsView } from "@/components/analytics";
import type { InterviewTemplate, Question, Project } from "@shared/schema";

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

interface TemplateWithQuestions extends InterviewTemplate {
  questions?: Question[];
}

function QuestionCard({ question, index }: { question: Question; index: number }) {
  const Icon = questionTypeIcons[question.questionType] || MessageSquare;
  
  return (
    <Card data-testid={`card-question-${question.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary font-medium text-sm shrink-0">
            {index + 1}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <Icon className="w-3 h-3" />
                {questionTypeLabels[question.questionType]}
              </Badge>
              {question.isRequired && (
                <Badge variant="secondary" className="text-xs">Required</Badge>
              )}
              {question.timeHintSeconds && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Clock className="w-3 h-3" />
                  {question.timeHintSeconds}s
                </Badge>
              )}
            </div>
            <p className="font-medium">{question.questionText}</p>
            {question.guidance && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <span className="font-medium">Guidance:</span> {question.guidance}
              </p>
            )}
            {question.questionType === "scale" && question.scaleMin !== null && question.scaleMax !== null && (
              <p className="text-sm text-muted-foreground">
                Scale: {question.scaleMin} to {question.scaleMax}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;

  const { data: template, isLoading } = useQuery<TemplateWithQuestions>({
    queryKey: ["/api/templates", templateId],
    enabled: !!templateId,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Template not found</h3>
            <p className="text-muted-foreground mb-4">
              The template you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questions = template.questions || [];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${template.projectId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
              <Badge variant="outline">v{template.version}</Badge>
              {template.isActive ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary">Draft</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {template.objective || "No objective set"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/templates/${templateId}/edit`}>
            <Button variant="outline" size="sm" data-testid="button-edit-template">
              <Settings className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Link href={`/collections/new?templateId=${templateId}`}>
            <Button size="sm" data-testid="button-launch-collection">
              <Play className="w-4 h-4 mr-2" />
              Launch Collection
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{questions.length}</p>
              <p className="text-sm text-muted-foreground">Questions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {questions.reduce((sum, q) => sum + (q.timeHintSeconds || 60), 0) / 60} min
              </p>
              <p className="text-sm text-muted-foreground">Est. Duration</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">0</p>
              <p className="text-sm text-muted-foreground">Collections</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="questions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="questions" data-testid="tab-questions">
            <MessageSquare className="w-4 h-4 mr-2" />
            Questions ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="space-y-4">
          {template.tone && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Tone:</span>
                  <Badge variant="outline">{template.tone}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {questions.length > 0 ? (
            <div className="space-y-3">
              {questions.map((question, index) => (
                <QuestionCard key={question.id} question={question} index={index} />
              ))}
            </div>
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-medium mb-2">No questions yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  This template doesn't have any questions.
                </p>
                <Link href={`/templates/${templateId}/edit`}>
                  <Button data-testid="button-add-questions">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Questions
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics">
          <TemplateAnalyticsView templateId={templateId!} templateName={template.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
