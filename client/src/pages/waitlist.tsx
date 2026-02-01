import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mic, CheckCircle2, LogOut, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function WaitlistPage() {
  const { user, email, isOnWaitlist, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [consentNewsletter, setConsentNewsletter] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [submitted, setSubmitted] = useState(isOnWaitlist);

  const submitMutation = useMutation({
    mutationFn: async (data: {
      firstName: string;
      lastName: string;
      consentNewsletter: boolean;
      consentMarketing: boolean;
    }) => {
      const response = await apiRequest("POST", "/api/waitlist", data);
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/invite-status"] });
      toast({
        title: "You're on the list!",
        description: "We'll notify you when you have access to Alvia.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Something went wrong",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter your first and last name.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      consentNewsletter,
      consentMarketing,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Mic className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">Alvia</span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                disabled={isLoggingOut}
                data-testid="button-logout"
              >
                {isLoggingOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span className="ml-2 hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg mx-auto">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ duration: 0.5 }}
          >
            {submitted ? (
              <Card>
                <CardHeader className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-serif">You're on the waitlist!</CardTitle>
                  <CardDescription className="text-base">
                    Thanks for your interest in Alvia. We'll reach out when your access is ready.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Signed in as <span className="font-medium text-foreground">{email}</span>
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => logout()}
                    disabled={isLoggingOut}
                    data-testid="button-signout-different-account"
                  >
                    Sign in with a different account
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="text-center space-y-2">
                  <CardTitle className="text-2xl font-serif">Join the Waitlist</CardTitle>
                  <CardDescription className="text-base">
                    Alvia is currently invite-only. Join the waitlist and we'll notify you when access opens up.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email || ""}
                        disabled
                        className="bg-muted"
                        data-testid="input-email"
                      />
                      <p className="text-xs text-muted-foreground">
                        From your Replit account.{" "}
                        <button
                          type="button"
                          onClick={() => logout()}
                          className="text-primary underline hover:no-underline"
                          data-testid="link-use-different-account"
                        >
                          Use a different account
                        </button>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First name</Label>
                        <Input
                          id="firstName"
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Jane"
                          required
                          data-testid="input-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last name</Label>
                        <Input
                          id="lastName"
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Smith"
                          required
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="newsletter"
                          checked={consentNewsletter}
                          onCheckedChange={(checked) => setConsentNewsletter(checked === true)}
                          data-testid="checkbox-newsletter"
                        />
                        <Label htmlFor="newsletter" className="text-sm font-normal leading-relaxed cursor-pointer">
                          I'd like to receive the Alvia newsletter with product updates and research insights.
                        </Label>
                      </div>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="marketing"
                          checked={consentMarketing}
                          onCheckedChange={(checked) => setConsentMarketing(checked === true)}
                          data-testid="checkbox-marketing"
                        />
                        <Label htmlFor="marketing" className="text-sm font-normal leading-relaxed cursor-pointer">
                          I consent to receiving marketing communications from Alvia.
                        </Label>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={submitMutation.isPending}
                      data-testid="button-join-waitlist"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        "Join Waitlist"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
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
