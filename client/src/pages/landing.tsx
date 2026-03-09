import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Mic,
  BarChart3,
  Shield,
  Users,
  Zap,
  FileText,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SignInButton } from "@clerk/clerk-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type ConversationCategory = "adaptive" | "cross_interview" | "analytics_guided";

interface ConversationExample {
  question: string;
  response: string;
  questionNumber: number;
  totalQuestions: number;
  category: ConversationCategory;
}

const conversationExamples: ConversationExample[] = [
  {
    question:
      "You mentioned the onboarding felt really structured. What specifically made you feel supported during that first week?",
    response:
      "Honestly, it was having a buddy assigned from day one. I never had to wonder who to ask...",
    questionNumber: 3,
    totalQuestions: 8,
    category: "adaptive",
  },
  {
    question:
      "You said the app felt frustrating at checkout. Can you walk me through what happened?",
    response:
      "I'd added everything to my cart, but then it asked me to re-enter my address even though I was logged in...",
    questionNumber: 4,
    totalQuestions: 7,
    category: "adaptive",
  },
  {
    question:
      "That's interesting; you said cost wasn't the main factor. What ultimately tipped your decision?",
    response:
      "It was really about trust. The other provider had better reviews from people in my situation...",
    questionNumber: 5,
    totalQuestions: 9,
    category: "adaptive",
  },
  {
    question:
      "You mentioned feeling 'out of the loop' during the project. When did that start to affect your work?",
    response:
      "It was about two weeks in. Decisions were being made in meetings I wasn't invited to...",
    questionNumber: 3,
    totalQuestions: 6,
    category: "adaptive",
  },
  {
    question:
      "A number of people in this study have mentioned trust as a deciding factor. What does trust look like for you when choosing a provider?",
    response:
      "For me, it's about transparency. If I can't see the pricing clearly upfront, I'm already suspicious...",
    questionNumber: 4,
    totalQuestions: 7,
    category: "cross_interview",
  },
  {
    question:
      "We're hearing a pattern around the first two weeks being the most critical. How did your experience during that window shape your long-term view?",
    response:
      "Completely. By day three I'd already decided whether I was going to stick with it or start looking elsewhere...",
    questionNumber: 3,
    totalQuestions: 8,
    category: "cross_interview",
  },
  {
    question:
      "Interestingly, speed of response keeps coming up as more important than getting the perfect answer. Does that resonate with your experience?",
    response:
      "Absolutely. I'd rather get a good-enough answer in five minutes than wait two days for the ideal one...",
    questionNumber: 5,
    totalQuestions: 8,
    category: "cross_interview",
  },
  {
    question:
      "You've talked about what worked well, but I'm curious; was there a moment where things didn't go as smoothly?",
    response:
      "Actually, yes. The migration process was a nightmare. We lost two weeks of data and nobody took ownership...",
    questionNumber: 5,
    totalQuestions: 7,
    category: "analytics_guided",
  },
  {
    question:
      "Earlier you mentioned the team was great, but you also said you nearly left after six months. Help me understand what changed.",
    response:
      "It wasn't the people, it was the lack of growth. I could see the ceiling very clearly, and nobody was talking about it...",
    questionNumber: 4,
    totalQuestions: 6,
    category: "analytics_guided",
  },
  {
    question:
      "You've focused a lot on the technical side. I'd love to hear how this affected you day-to-day; what was the emotional toll?",
    response:
      "That's a good question. I think I was more stressed than I realised at the time. My partner kept saying I was bringing work home...",
    questionNumber: 6,
    totalQuestions: 8,
    category: "analytics_guided",
  },
];

const waveformHeights = Array.from({ length: 20 }, (_, i) => ({
  peak: Math.random() * 32 + 8,
  delay: i * 0.05,
}));

const features = [
  {
    icon: Mic,
    title: "Voice-First Interviews",
    description:
      "Natural conversations that feel like talking to a skilled interviewer, not filling out a form.",
  },
  {
    icon: BarChart3,
    title: "Structured Insights",
    description:
      "Every response is automatically summarised, quoted, and analysed for patterns across interviews.",
  },
  {
    icon: Shield,
    title: "Privacy by Design",
    description:
      "Built-in PII redaction, consent controls, and GDPR-ready data handling.",
  },
  {
    icon: Users,
    title: "Scale Qualitative Research",
    description:
      "Run hundreds of interviews without losing the depth and nuance of one-on-one conversations.",
  },
  {
    icon: Zap,
    title: "Adaptive Probing",
    description:
      "AI-powered follow-up questions that dig deeper based on respondent answers.",
  },
  {
    icon: FileText,
    title: "Actionable Results",
    description:
      "Cross-interview themes, actionable insights and tailored recommendations.",
  },
];

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function LandingPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % conversationExamples.length);
    }, 9000);
    return () => clearInterval(interval);
  }, [isPaused, prefersReducedMotion]);

  const handleCardInteraction = useCallback((active: boolean) => {
    setIsPaused(active);
  }, []);

  const current = conversationExamples[currentIndex];

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Mic className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">
                Alvia
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-features"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-how-it-works"
              >
                How it Works
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm" data-testid="button-sign-in">
                  Sign in
                </Button>
              </SignInButton>
              <SignInButton mode="modal">
                <Button size="sm" data-testid="button-get-started">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </SignInButton>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="grid lg:grid-cols-2 gap-12 items-center"
            >
              <motion.div variants={fadeInUp} className="space-y-8">
                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-semibold tracking-tight leading-tight">
                    Interview depth,{" "}
                    <span className="text-primary">survey scale</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                    Alvia is a powerful voice interviewer and adviser who
                    listens, adapts, and captures the nuance that traditional
                    surveys miss.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <SignInButton mode="modal">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto"
                      data-testid="button-hero-get-started"
                    >
                      Start Free Trial
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </SignInButton>
                  <a
                    href="https://youtube.com/shorts/L9nMTfokgxA?feature=share"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto"
                      data-testid="button-watch-demo"
                    >
                      Watch Demo
                    </Button>
                  </a>
                </div>

                <div className="flex flex-wrap gap-6 pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>Conversations, not surveys</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>Live in minutes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>Tailored recommendations</span>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={fadeInUp} className="relative lg:pl-8">
                <div
                  className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-1"
                  data-testid="carousel-container"
                  onMouseEnter={() => handleCardInteraction(true)}
                  onMouseLeave={() => handleCardInteraction(false)}
                  onFocus={() => handleCardInteraction(true)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      handleCardInteraction(false);
                    }
                  }}
                >
                  <div className="rounded-xl bg-card border border-card-border p-8 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mic className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p
                          className="font-medium"
                          data-testid="text-alvia-status"
                        >
                          Alvia is listening...
                        </p>
                        <p
                          className="text-sm text-muted-foreground"
                          data-testid="text-question-counter"
                        >
                          Question {current.questionNumber} of{" "}
                          {current.totalQuestions}
                        </p>
                      </div>
                    </div>

                    <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
                      {conversationExamples.map((ex, i) => (
                        <p
                          key={i}
                          className="text-lg font-medium invisible"
                          aria-hidden="true"
                        >
                          "{ex.question}"
                        </p>
                      ))}
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={currentIndex}
                          initial={
                            prefersReducedMotion ? false : { opacity: 0 }
                          }
                          animate={{ opacity: 1 }}
                          exit={
                            prefersReducedMotion ? undefined : { opacity: 0 }
                          }
                          transition={{ duration: 0.3 }}
                          className="text-lg font-medium"
                          data-testid="text-alvia-question"
                        >
                          "{current.question}"
                        </motion.p>
                      </AnimatePresence>
                    </div>

                    <div className="h-12 flex items-center gap-1">
                      {waveformHeights.map((bar, i) =>
                        prefersReducedMotion ? (
                          <div
                            key={i}
                            className="w-1 bg-primary rounded-full"
                            style={{ height: bar.peak }}
                          />
                        ) : (
                          <motion.div
                            key={i}
                            className="w-1 bg-primary rounded-full"
                            animate={{ height: [8, bar.peak, 8] }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: bar.delay,
                            }}
                          />
                        ),
                      )}
                    </div>

                    <div className="pt-4 border-t border-border grid [&>*]:col-start-1 [&>*]:row-start-1">
                      {conversationExamples.map((ex, i) => (
                        <p
                          key={i}
                          className="text-sm text-muted-foreground italic invisible"
                          aria-hidden="true"
                        >
                          "{ex.response}"
                        </p>
                      ))}
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={currentIndex}
                          initial={
                            prefersReducedMotion ? false : { opacity: 0 }
                          }
                          animate={{ opacity: 1 }}
                          exit={
                            prefersReducedMotion ? undefined : { opacity: 0 }
                          }
                          transition={{ duration: 0.3, delay: 0.05 }}
                          className="text-sm text-muted-foreground italic"
                          data-testid="text-respondent-answer"
                        >
                          "{current.response}"
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>

                  <div
                    className="flex justify-center gap-1.5 pt-4 pb-2"
                    data-testid="carousel-dots"
                  >
                    {conversationExamples.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentIndex(i)}
                        aria-label={`Example ${i + 1} of ${conversationExamples.length}`}
                        aria-current={i === currentIndex ? "true" : undefined}
                        data-testid={`carousel-dot-${i}`}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-300",
                          i === currentIndex
                            ? "bg-primary w-4"
                            : "bg-muted-foreground/30 hover:bg-muted-foreground/50 w-1.5",
                        )}
                      />
                    ))}
                  </div>
                </div>

                <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-radial from-primary/20 via-transparent to-transparent blur-3xl" />
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section
          id="features"
          className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30"
        >
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="space-y-12"
            >
              <motion.div
                variants={fadeInUp}
                className="text-center space-y-4 max-w-2xl mx-auto"
              >
                <h2 className="text-3xl sm:text-4xl font-serif font-semibold">
                  Everything you need for qualitative research
                </h2>
                <p className="text-muted-foreground text-lg">
                  Alvia combines the depth of interviews with the scale of
                  surveys, powered by AI.
                </p>
              </motion.div>

              <motion.div
                variants={staggerContainer}
                className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {features.map((feature, index) => (
                  <motion.div key={index} variants={fadeInUp}>
                    <Card className="h-full hover-elevate transition-all duration-300">
                      <CardContent className="p-6 space-y-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <feature.icon className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="font-medium text-lg">{feature.title}</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {feature.description}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="space-y-16"
            >
              <motion.div
                variants={fadeInUp}
                className="text-center space-y-4 max-w-2xl mx-auto"
              >
                <h2 className="text-3xl sm:text-4xl font-serif font-semibold">
                  How Alvia works
                </h2>
                <p className="text-muted-foreground text-lg">
                  From setup to insights in four simple steps.
                </p>
              </motion.div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  {
                    step: "01",
                    title: "Create Template",
                    desc: "Define your interview context, objectives, questions, and guidance for each question type.",
                  },
                  {
                    step: "02",
                    title: "Launch Collection",
                    desc: "Invite respondents with authenticated access and monitor progress in real-time.",
                  },
                  {
                    step: "03",
                    title: "Conduct Interviews",
                    desc: "Respondents have voice conversations with Alvia, your AI interviewer.",
                  },
                  {
                    step: "04",
                    title: "Analyse Insights",
                    desc: "Review structured summaries, recommendations, key quotes, and cross-interview themes.",
                  },
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    variants={fadeInUp}
                    className="relative"
                  >
                    <div className="space-y-4">
                      <span className="text-5xl font-serif font-bold text-primary/20">
                        {item.step}
                      </span>
                      <h3 className="font-medium text-lg">{item.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                    {index < 3 && (
                      <div className="hidden lg:block absolute top-8 right-0 translate-x-1/2 w-12 h-px bg-border" />
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-primary-foreground">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl sm:text-4xl font-serif font-semibold">
              Ready to transform your research?
            </h2>
            <p className="text-lg opacity-90 max-w-2xl mx-auto">
              Join teams running scalable, voice-led interviews that capture
              insights traditional surveys miss.
            </p>
            <SignInButton mode="modal">
              <Button
                size="lg"
                variant="secondary"
                className="mt-4"
                data-testid="button-cta-get-started"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </SignInButton>
          </div>
        </section>
      </main>

      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mic className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">Alvia</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-terms-footer"
            >
              Terms &amp; Conditions
            </a>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Alvia. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
