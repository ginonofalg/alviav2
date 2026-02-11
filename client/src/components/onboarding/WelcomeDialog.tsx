import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import {
  Mic,
  Eye,
  FolderKanban,
  FileText,
  Play,
  BarChart3,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

interface Project {
  id: number;
  name: string;
}

const SLIDES = [
  {
    key: "welcome",
    title: "Welcome to Alvia",
    icon: Mic,
  },
  {
    key: "team",
    title: "Meet Your AI Team",
    icon: null,
  },
  {
    key: "how",
    title: "How It Works",
    icon: null,
  },
  {
    key: "start",
    title: "Your First Steps",
    icon: null,
  },
] as const;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

export function WelcomeDialog() {
  const { showWelcome, updateOnboarding } = useOnboarding();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [, navigate] = useLocation();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: showWelcome,
  });

  const demoProject = projects?.find((p) =>
    p.name.toLowerCase().includes("demo")
  );

  const handleComplete = () => {
    updateOnboarding({ welcomeCompleted: true, testMode: false });
  };

  const handleExploreDemo = () => {
    updateOnboarding({ welcomeCompleted: true, testMode: false });
    if (demoProject) {
      navigate(`/projects/${demoProject.id}`);
    }
  };

  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  if (!showWelcome) return null;

  return (
    <Dialog open={showWelcome} onOpenChange={(open) => !open && handleComplete()}>
      <DialogContent
        className="sm:max-w-lg p-0 gap-0 overflow-hidden"
        data-testid="welcome-dialog"
      >
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {SLIDES[step].title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Get started with Alvia - step {step + 1} of {SLIDES.length}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 min-h-[280px] overflow-hidden relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {step === 0 && <SlideWelcome />}
              {step === 1 && <SlideTeam />}
              {step === 2 && <SlideHowItWorks />}
              {step === 3 && <SlideFirstSteps />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-4 p-4 border-t bg-muted/30">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-muted-foreground/30"
                }`}
                data-testid={`indicator-step-${i}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToStep(step - 1)}
                data-testid="button-welcome-back"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
            {step < 3 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleComplete}
                  data-testid="button-welcome-skip"
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={() => goToStep(step + 1)}
                  data-testid="button-welcome-next"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                {demoProject && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExploreDemo}
                    data-testid="button-welcome-explore-demo"
                  >
                    Explore the Demo
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleComplete}
                  data-testid="button-welcome-get-started"
                >
                  Let's Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SlideWelcome() {
  return (
    <div className="space-y-4">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
        <Mic className="w-6 h-6 text-primary" />
      </div>
      <p className="text-muted-foreground leading-relaxed">
        Alvia is a voice-based interview platform that lets you conduct research
        at scale. Real conversations, real insights — not just form responses.
      </p>
    </div>
  );
}

function SlideTeam() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-3 p-4 rounded-md bg-muted/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Mic className="w-4 h-4 text-primary" />
          </div>
          <span className="font-medium">Alvia</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your AI interviewer. She conducts voice conversations, adapts
          follow-ups in real-time, and captures nuance that surveys miss. Shaped
          by your Research Objective and Interview Objective.
        </p>
      </div>
      <div className="space-y-3 p-4 rounded-md bg-muted/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Eye className="w-4 h-4 text-primary" />
          </div>
          <span className="font-medium">Barbara</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your research orchestrator. She monitors every interview, guides Alvia
          on when to probe or move on, and generates analytics. Uses your Target
          Audience and Strategic Context.
        </p>
      </div>
    </div>
  );
}

function SlideHowItWorks() {
  const steps = [
    {
      icon: FolderKanban,
      label: "Project",
      desc: "Define your research goals, audience, and strategic context",
    },
    {
      icon: FileText,
      label: "Template",
      desc: "Create interview questions with guidance for each",
    },
    {
      icon: Play,
      label: "Collection",
      desc: "Launch a collection and invite respondents",
    },
    {
      icon: BarChart3,
      label: "Analyse",
      desc: "Review transcripts, summaries, and cross-interview themes",
    },
  ];

  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground w-4 shrink-0 text-center">
            {i + 1}.
          </span>
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <s.icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium">{s.label}</span>
            <p className="text-sm text-muted-foreground">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlideFirstSteps() {
  const checklist = [
    "Explore the demo project",
    "Create your first project",
    "Build an interview template",
    "Launch a collection",
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Here's a quick checklist to get you up and running:
      </p>
      <div className="space-y-2">
        {checklist.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            <span className="text-sm">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
