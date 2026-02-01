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
import { motion } from "framer-motion";

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
              <a href="/api/login">
                <Button variant="ghost" size="sm" data-testid="button-sign-in">
                  Sign in
                </Button>
              </a>
              <a href="/api/login">
                <Button size="sm" data-testid="button-get-started">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
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
                  <a href="/api/login">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto"
                      data-testid="button-hero-get-started"
                    >
                      Start Free Trial
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </a>
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
                    <span>Free trial</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>Start interviewing in minutes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>GDPR compliant</span>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={fadeInUp} className="relative lg:pl-8">
                <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-1">
                  <div className="rounded-xl bg-card border border-card-border p-8 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mic className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Alvia is listening...</p>
                        <p className="text-sm text-muted-foreground">
                          Question 3 of 8
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-lg font-medium">
                        "Tell me about a time when the onboarding process
                        exceeded your expectations."
                      </p>
                      <div className="h-12 flex items-center gap-1">
                        {[...Array(20)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-1 bg-primary rounded-full"
                            animate={{
                              height: [8, Math.random() * 32 + 8, 8],
                            }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.05,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground italic">
                        "Well, I remember when I joined my current company, the
                        first week was incredibly structured..."
                      </p>
                    </div>
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
            <a href="/api/login">
              <Button
                size="lg"
                variant="secondary"
                className="mt-4"
                data-testid="button-cta-get-started"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
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
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Alvia. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
