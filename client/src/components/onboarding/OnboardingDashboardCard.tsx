import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useOnboarding } from "@/hooks/use-onboarding";
import {
  FolderKanban,
  FileText,
  Play,
  Search,
  ArrowRight,
  X,
  CheckCircle2,
  Circle,
} from "lucide-react";

interface Project {
  id: number;
  name: string;
}

export function OnboardingDashboardCard() {
  const { showDashboardCard, milestones, progress, completedCount, updateOnboarding } =
    useOnboarding();
  const [, navigate] = useLocation();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: showDashboardCard,
  });

  const demoProject = projects?.find((p) =>
    p.name.toLowerCase().includes("demo")
  );

  if (!showDashboardCard) return null;

  const steps = [
    {
      key: "demoExplored",
      icon: Search,
      title: "Explore the demo project",
      description: "See how Alvia structures a research project with questions and guidance",
      done: milestones.demoExplored,
      action: () => {
        if (demoProject) navigate(`/projects/${demoProject.id}`);
      },
      actionLabel: "View Demo",
      enabled: true,
    },
    {
      key: "projectCreated",
      icon: FolderKanban,
      title: "Create your first project",
      description: "Define your research goals, audience, and strategic context",
      done: milestones.projectCreated,
      action: () => navigate("/projects/new"),
      actionLabel: "New Project",
      enabled: milestones.demoExplored,
    },
    {
      key: "templateCreated",
      icon: FileText,
      title: "Add an interview template",
      description: "Build interview questions with guidance for Alvia",
      done: milestones.templateCreated,
      action: () => navigate("/templates"),
      actionLabel: "Templates",
      enabled: milestones.projectCreated,
    },
    {
      key: "collectionCreated",
      icon: Play,
      title: "Launch a collection",
      description: "Start collecting interview responses from participants",
      done: milestones.collectionCreated,
      action: () => navigate("/collections/new"),
      actionLabel: "New Collection",
      enabled: milestones.templateCreated,
    },
  ];

  return (
    <Card data-testid="onboarding-dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <CardTitle className="text-lg">Getting Started</CardTitle>
          <div className="flex items-center gap-3">
            <Progress
              value={progress * 100}
              className="h-2 flex-1 max-w-xs"
              data-testid="progress-onboarding"
            />
            <span className="text-xs text-muted-foreground shrink-0">
              {completedCount} of 4 complete
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => updateOnboarding({ dashboardGuideHidden: true })}
          data-testid="button-dismiss-onboarding-card"
        >
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((step) => {
          const isCurrent = !step.done && step.enabled;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 p-3 rounded-md transition-colors ${
                isCurrent ? "bg-muted/50" : ""
              } ${!step.enabled && !step.done ? "opacity-50" : ""}`}
              data-testid={`onboarding-step-${step.key}`}
            >
              <div className="shrink-0">
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle
                    className={`w-5 h-5 ${isCurrent ? "text-primary" : "text-muted-foreground/40"}`}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}
                >
                  {step.title}
                </p>
                {isCurrent && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
              {isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={step.action}
                  data-testid={`button-onboarding-${step.key}`}
                >
                  {step.actionLabel}
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              )}
              {step.done && (
                <Badge variant="secondary" className="shrink-0">
                  Done
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
