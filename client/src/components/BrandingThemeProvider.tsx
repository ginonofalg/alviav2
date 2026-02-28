import { useMemo } from "react";
import type { BrandingColors } from "@shared/schema";
import { deriveColorVariables } from "@/lib/color-utils";

interface BrandingThemeProviderProps {
  brandingColors?: BrandingColors | null;
  children: React.ReactNode;
}

export function BrandingThemeProvider({ brandingColors, children }: BrandingThemeProviderProps) {
  const style = useMemo(() => {
    if (!brandingColors) return null;
    return deriveColorVariables(brandingColors);
  }, [brandingColors]);

  if (!style) {
    return <>{children}</>;
  }

  return (
    <div style={style} className="contents" data-testid="branding-theme-wrapper">
      {children}
    </div>
  );
}
