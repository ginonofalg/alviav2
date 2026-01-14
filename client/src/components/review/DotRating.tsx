import { cn } from "@/lib/utils";

interface DotRatingProps {
  value: number | null;
  onChange: (value: number) => void;
  max?: number;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function DotRating({
  value,
  onChange,
  max = 5,
  label,
  description,
  disabled = false,
}: DotRatingProps) {
  return (
    <div className="space-y-2" data-testid={`rating-${label?.toLowerCase().replace(/\s+/g, '-')}`}>
      {label && (
        <div>
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[...Array(max)].map((_, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onChange(i + 1)}
              className={cn(
                "w-6 h-6 rounded-full border-2 transition-colors",
                value !== null && i < value
                  ? "bg-primary border-primary"
                  : "bg-background border-muted-foreground/30 hover:border-primary/50",
                disabled && "cursor-not-allowed opacity-50"
              )}
              aria-label={`Rate ${i + 1} out of ${max}`}
              data-testid={`rating-dot-${i + 1}`}
            />
          ))}
        </div>
        {value !== null && (
          <span className="text-sm text-muted-foreground">{value}/{max}</span>
        )}
      </div>
    </div>
  );
}
