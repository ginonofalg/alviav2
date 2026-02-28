import { useState, useCallback } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import type { BrandingColors } from "@shared/schema";
import { getContrastRatio, getContrastColor, extractDominantColors } from "@/lib/color-utils";
import { BrandingThemeProvider } from "./BrandingThemeProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, Pipette, RotateCcw } from "lucide-react";

const DEFAULT_COLORS: BrandingColors = {
  primary: "#1a73e8",
  background: "#ffffff",
  foreground: "#1a1a1a",
  accent: "#e8f0fe",
};

interface ColorSlotConfig {
  key: keyof BrandingColors;
  label: string;
  description: string;
}

const COLOR_SLOTS: ColorSlotConfig[] = [
  { key: "primary", label: "Primary / Button", description: "Buttons, links, and accents" },
  { key: "background", label: "Background", description: "Page background color" },
  { key: "foreground", label: "Text", description: "Main text color" },
  { key: "accent", label: "Accent", description: "Highlights and secondary elements" },
];

interface BrandingColorPickerProps {
  colors: BrandingColors | null;
  onChange: (colors: BrandingColors | null) => void;
  brandingLogo?: string | null;
}

function ColorSwatch({
  color,
  label,
  description,
  onChange,
  testIdSuffix,
}: {
  color: string;
  label: string;
  description: string;
  onChange: (color: string) => void;
  testIdSuffix: string;
}) {
  return (
    <Popover>
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 w-full rounded-md border p-2 hover-elevate"
            data-testid={`button-color-${testIdSuffix}`}
          >
            <div
              className="w-8 h-8 rounded-md border flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="text-sm font-mono uppercase">{color}</span>
              <span className="text-xs text-muted-foreground truncate">{description}</span>
            </div>
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          <HexColorPicker
            color={color}
            onChange={onChange}
            data-testid={`picker-${testIdSuffix}`}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              prefixed={false}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-mono uppercase"
              data-testid={`input-color-${testIdSuffix}`}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContrastWarnings({ colors }: { colors: BrandingColors }) {
  const warnings: { message: string; severity: "error" | "warning" }[] = [];

  const textOnBg = getContrastRatio(colors.foreground, colors.background);
  if (textOnBg < 4.5) {
    warnings.push({
      message: `Text on background: ${textOnBg.toFixed(1)}:1 (min 4.5:1 for WCAG AA)`,
      severity: textOnBg < 3 ? "error" : "warning",
    });
  }

  const buttonTextColor = getContrastColor(colors.primary);
  const buttonContrast = getContrastRatio(buttonTextColor, colors.primary);
  if (buttonContrast < 3) {
    warnings.push({
      message: `Button text readability is low: ${buttonContrast.toFixed(1)}:1`,
      severity: "warning",
    });
  }

  if (colors.accent) {
    const accentOnBg = getContrastRatio(colors.accent, colors.background);
    if (accentOnBg < 1.2) {
      warnings.push({
        message: "Accent color is too similar to background",
        severity: "warning",
      });
    }
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="contrast-warnings">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 text-xs rounded-md p-2 ${
            w.severity === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
          }`}
          data-testid={`warning-contrast-${i}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}

function LivePreview({ colors }: { colors: BrandingColors }) {
  return (
    <BrandingThemeProvider brandingColors={colors}>
      <div
        className="rounded-md border overflow-hidden"
        style={{ backgroundColor: colors.background }}
        data-testid="branding-live-preview"
      >
        <div className="p-4 space-y-3">
          <h4 className="text-sm font-semibold" style={{ color: colors.foreground }}>
            Interview Preview
          </h4>
          <p className="text-xs" style={{ color: colors.foreground, opacity: 0.7 }}>
            This is how your branded interview pages will look to respondents.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={{
                backgroundColor: colors.primary,
                color: getContrastColor(colors.primary),
              }}
              data-testid="preview-button-primary"
            >
              Start Interview
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs font-medium border"
              style={{
                borderColor: colors.primary,
                color: colors.primary,
                backgroundColor: "transparent",
              }}
              data-testid="preview-button-outline"
            >
              Learn More
            </button>
          </div>
          {colors.accent && (
            <div
              className="rounded-md p-2 text-xs"
              style={{
                backgroundColor: colors.accent,
                color: colors.foreground,
              }}
              data-testid="preview-accent-block"
            >
              Accent highlight area
            </div>
          )}
        </div>
      </div>
    </BrandingThemeProvider>
  );
}

export default function BrandingColorPicker({
  colors,
  onChange,
  brandingLogo,
}: BrandingColorPickerProps) {
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);

  const currentColors = colors ?? DEFAULT_COLORS;

  const handleSlotChange = useCallback(
    (key: keyof BrandingColors, value: string) => {
      const updated = { ...currentColors, [key]: value };
      onChange(updated);
    },
    [currentColors, onChange]
  );

  const handleExtractFromLogo = useCallback(async () => {
    if (!brandingLogo) return;
    setExtracting(true);
    try {
      const dominant = await extractDominantColors(brandingLogo, 6);
      setExtractedColors(dominant);
    } catch {
      setExtractedColors([]);
    } finally {
      setExtracting(false);
    }
  }, [brandingLogo]);

  const handleReset = useCallback(() => {
    onChange(null);
    setExtractedColors([]);
  }, [onChange]);

  return (
    <div className="space-y-4" data-testid="branding-color-picker">
      {brandingLogo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Label className="text-sm font-medium">Extract from Logo</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExtractFromLogo}
              disabled={extracting}
              data-testid="button-extract-colors"
            >
              <Pipette className="w-4 h-4 mr-1.5" />
              {extracting ? "Extracting..." : "Extract Colors"}
            </Button>
          </div>
          {extractedColors.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="extracted-colors">
              {extractedColors.map((hex, i) => (
                <Popover key={i}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-8 h-8 rounded-md border hover-elevate"
                      style={{ backgroundColor: hex }}
                      title={hex}
                      data-testid={`swatch-extracted-${i}`}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="space-y-1">
                      <p className="text-xs font-mono">{hex}</p>
                      <div className="flex flex-col gap-1">
                        {COLOR_SLOTS.map((slot) => (
                          <Button
                            key={slot.key}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-start text-xs"
                            onClick={() => handleSlotChange(slot.key, hex)}
                            data-testid={`button-apply-${slot.key}-${i}`}
                          >
                            Use as {slot.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COLOR_SLOTS.map((slot) => (
          <ColorSwatch
            key={slot.key}
            color={currentColors[slot.key] ?? DEFAULT_COLORS[slot.key] ?? "#e8f0fe"}
            label={slot.label}
            description={slot.description}
            onChange={(val) => handleSlotChange(slot.key, val)}
            testIdSuffix={slot.key}
          />
        ))}
      </div>

      <ContrastWarnings colors={currentColors} />

      <Card>
        <CardContent className="p-3">
          <LivePreview colors={currentColors} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
          data-testid="button-reset-colors"
        >
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
