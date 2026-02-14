import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, Archive, User } from "lucide-react";
import type { Persona } from "@shared/schema";

const ATTITUDE_LABELS: Record<string, string> = {
  cooperative: "Cooperative",
  reluctant: "Reluctant",
  neutral: "Neutral",
  evasive: "Evasive",
  enthusiastic: "Enthusiastic",
};

const DOMAIN_LABELS: Record<string, string> = {
  none: "No Knowledge",
  basic: "Basic",
  intermediate: "Intermediate",
  expert: "Expert",
};

interface PersonaCardProps {
  persona: Persona;
  onEdit: (persona: Persona) => void;
  onArchive: (persona: Persona) => void;
  selected?: boolean;
  onSelect?: (persona: Persona) => void;
  selectable?: boolean;
}

export function PersonaCard({ persona, onEdit, onArchive, selected, onSelect, selectable }: PersonaCardProps) {
  return (
    <Card
      className={`hover-elevate transition-all duration-200 overflow-hidden ${selectable ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={selectable ? () => onSelect?.(persona) : undefined}
      data-testid={`card-persona-${persona.id}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base font-medium">{persona.name}</CardTitle>
            {persona.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{persona.description}</p>
            )}
          </div>
        </div>
        {!selectable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-persona-menu-${persona.id}`}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(persona)} data-testid="menu-edit-persona">
                <Edit className="w-4 h-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(persona)} className="text-destructive" data-testid="menu-archive-persona">
                <Archive className="w-4 h-4 mr-2" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="pt-0 pl-[3.25rem]">
        <div className="flex flex-wrap gap-1">
          {persona.ageRange && <Badge variant="outline" className="text-xs">{persona.ageRange}</Badge>}
          {persona.occupation && <Badge variant="outline" className="text-xs">{persona.occupation}</Badge>}
          <Badge variant="secondary" className="text-xs">{ATTITUDE_LABELS[persona.attitude] || persona.attitude}</Badge>
          <Badge variant="secondary" className="text-xs">Verbosity: {persona.verbosity}</Badge>
          <Badge variant="secondary" className="text-xs">{DOMAIN_LABELS[persona.domainKnowledge] || persona.domainKnowledge}</Badge>
        </div>
        {(persona.traits || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(persona.traits || []).slice(0, 4).map((t) => (
              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
            ))}
            {(persona.traits || []).length > 4 && (
              <Badge variant="outline" className="text-xs">+{(persona.traits || []).length - 4} more</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
