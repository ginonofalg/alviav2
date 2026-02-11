import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useOnboarding } from "@/hooks/use-onboarding";
import { Lightbulb, ChevronDown, X } from "lucide-react";

export interface FieldGuideItem {
  field: string;
  impact: string;
}

type GuideKey = "project" | "template" | "collection";

interface OnboardingFieldGuideProps {
  guideKey: GuideKey;
  title: string;
  items: FieldGuideItem[];
  tip?: string;
}

const GUIDE_STATE_MAP: Record<GuideKey, "projectGuideShown" | "templateGuideShown" | "collectionGuideShown"> = {
  project: "projectGuideShown",
  template: "templateGuideShown",
  collection: "collectionGuideShown",
};

const SHOW_MAP: Record<GuideKey, "showProjectGuide" | "showTemplateGuide" | "showCollectionGuide"> = {
  project: "showProjectGuide",
  template: "showTemplateGuide",
  collection: "showCollectionGuide",
};

export function OnboardingFieldGuide({
  guideKey,
  title,
  items,
  tip,
}: OnboardingFieldGuideProps) {
  const onboarding = useOnboarding();
  const [isOpen, setIsOpen] = useState(true);

  const showKey = SHOW_MAP[guideKey];
  const shouldShow = onboarding[showKey];

  if (!shouldShow) return null;

  const handleDismiss = () => {
    onboarding.updateOnboarding({ [GUIDE_STATE_MAP[guideKey]]: true });
  };

  return (
    <Card
      className="border-primary/20 bg-primary/5"
      data-testid={`field-guide-${guideKey}`}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between gap-4 p-4">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left flex-1">
              <Lightbulb className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{title}</span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            data-testid={`button-dismiss-guide-${guideKey}`}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {items.map((item, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-sm font-medium">{item.field}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.impact}
                </p>
              </div>
            ))}
            {tip && (
              <div className="pt-1 border-t border-primary/10">
                <p className="text-xs text-muted-foreground italic">{tip}</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={handleDismiss}
              data-testid={`button-gotit-guide-${guideKey}`}
            >
              Got it, don't show again
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
