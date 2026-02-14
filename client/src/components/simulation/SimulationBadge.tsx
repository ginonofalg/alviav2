import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

interface SimulationBadgeProps {
  className?: string;
}

export function SimulationBadge({ className }: SimulationBadgeProps) {
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${className || ""}`} data-testid="badge-simulated">
      <Bot className="w-3 h-3" />
      Simulated
    </Badge>
  );
}
