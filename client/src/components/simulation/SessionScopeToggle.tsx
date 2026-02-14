import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Users, Bot, Layers } from "lucide-react";
import type { SessionScope } from "@shared/types/simulation";

interface SessionScopeToggleProps {
  value: SessionScope;
  onChange: (value: SessionScope) => void;
}

export function SessionScopeToggle({ value, onChange }: SessionScopeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as SessionScope);
      }}
      variant="outline"
      size="sm"
      data-testid="toggle-session-scope"
    >
      <ToggleGroupItem value="real" data-testid="toggle-scope-real" className="gap-1 text-xs">
        <Users className="w-3 h-3" />
        Real
      </ToggleGroupItem>
      <ToggleGroupItem value="simulated" data-testid="toggle-scope-simulated" className="gap-1 text-xs">
        <Bot className="w-3 h-3" />
        Simulated
      </ToggleGroupItem>
      <ToggleGroupItem value="combined" data-testid="toggle-scope-combined" className="gap-1 text-xs">
        <Layers className="w-3 h-3" />
        All
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
