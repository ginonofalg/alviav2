import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import type { BrandingColors } from "@shared/schema";
import { BrandingThemeProvider } from "@/components/BrandingThemeProvider";

export default function InterviewCompletePage() {
  const [, navigate] = useLocation();

  const brandingColors = useMemo<BrandingColors | null>(() => {
    try {
      const stored = sessionStorage.getItem("alvia_branding_colors");
      if (stored) {
        return JSON.parse(stored) as BrandingColors;
      }
    } catch {}
    return null;
  }, []);

  return (
    <BrandingThemeProvider brandingColors={brandingColors}>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Interview Complete</h1>
              <p className="text-muted-foreground">
                Thank you for participating in this interview. Your responses have been recorded and will help provide valuable insights.
              </p>
            </div>

            <div className="pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                You may now close this window or return to the home page.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/")}
                className="gap-2"
                data-testid="button-return-home"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </BrandingThemeProvider>
  );
}
