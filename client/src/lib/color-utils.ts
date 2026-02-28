import type { BrandingColors } from "@shared/schema";

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === rn) {
      h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / delta + 2) * 60;
    } else {
      h = ((rn - gn) / delta + 4) * 60;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToCssValue(hsl: { h: number; s: number; l: number }): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastColor(hex: string): "#ffffff" | "#000000" {
  const lum = relativeLuminance(hex);
  return lum > 0.179 ? "#000000" : "#ffffff";
}

export function deriveColorVariables(colors: BrandingColors): Record<string, string> {
  const primary = hexToHsl(colors.primary);
  const bg = hexToHsl(colors.background);
  const fg = hexToHsl(colors.foreground);
  const accent = colors.accent ? hexToHsl(colors.accent) : { h: primary.h, s: Math.max(primary.s - 30, 10), l: Math.min(primary.l + 20, 90) };

  const primaryFgColor = getContrastColor(colors.primary);
  const primaryFg = hexToHsl(primaryFgColor);

  const mutedL = bg.l > 50 ? bg.l - 8 : bg.l + 8;
  const muted = { h: bg.h, s: Math.max(bg.s - 5, 0), l: mutedL };

  const mutedFgL = fg.l > 50 ? fg.l - 30 : fg.l + 30;
  const mutedFg = { h: fg.h, s: Math.max(fg.s - 5, 0), l: mutedFgL };

  const cardL = bg.l > 50 ? bg.l - 2 : bg.l + 2;
  const card = { h: bg.h, s: bg.s, l: cardL };

  const borderL = bg.l > 50 ? bg.l - 12 : bg.l + 12;
  const border = { h: bg.h, s: bg.s, l: borderL };

  const inputL = bg.l > 50 ? bg.l - 25 : bg.l + 25;
  const input = { h: bg.h, s: bg.s, l: inputL };

  const secondaryL = bg.l > 50 ? bg.l - 12 : bg.l + 12;
  const secondary = { h: bg.h, s: bg.s, l: secondaryL };

  const accentBorderL = accent.l > 50 ? accent.l - 5 : accent.l + 5;

  return {
    "--primary": hslToCssValue(primary),
    "--primary-foreground": hslToCssValue(primaryFg),
    "--background": hslToCssValue(bg),
    "--foreground": hslToCssValue(fg),
    "--accent": hslToCssValue(accent),
    "--accent-foreground": hslToCssValue(fg),
    "--card": hslToCssValue(card),
    "--card-foreground": hslToCssValue(fg),
    "--card-border": hslToCssValue({ h: bg.h, s: bg.s, l: cardL > 50 ? cardL - 4 : cardL + 4 }),
    "--border": hslToCssValue(border),
    "--input": hslToCssValue(input),
    "--ring": hslToCssValue(primary),
    "--muted": hslToCssValue(muted),
    "--muted-foreground": hslToCssValue(mutedFg),
    "--secondary": hslToCssValue(secondary),
    "--secondary-foreground": hslToCssValue(fg),
    "--popover": hslToCssValue(card),
    "--popover-foreground": hslToCssValue(fg),
    "--popover-border": hslToCssValue(border),
    "--destructive": "0 84% 42%",
    "--destructive-foreground": "0 84% 98%",
    "--accent-border": hslToCssValue({ h: accent.h, s: accent.s, l: accentBorderL }),
  };
}

export async function extractDominantColors(imageDataUrl: string, count: number = 5): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          if (a < 128) continue;

          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          const existing = colorBuckets.get(key);
          if (existing) {
            existing.r = (existing.r * existing.count + r) / (existing.count + 1);
            existing.g = (existing.g * existing.count + g) / (existing.count + 1);
            existing.b = (existing.b * existing.count + b) / (existing.count + 1);
            existing.count++;
          } else {
            colorBuckets.set(key, { r, g, b, count: 1 });
          }
        }

        const sorted = Array.from(colorBuckets.values())
          .filter((c) => {
            const max = Math.max(c.r, c.g, c.b);
            const min = Math.min(c.r, c.g, c.b);
            const saturation = max === 0 ? 0 : (max - min) / max;
            const brightness = max / 255;
            return saturation > 0.05 || (brightness > 0.1 && brightness < 0.9);
          })
          .sort((a, b) => b.count - a.count);

        const results: string[] = [];
        for (const color of sorted) {
          if (results.length >= count) break;
          const hex = `#${Math.round(color.r).toString(16).padStart(2, "0")}${Math.round(color.g).toString(16).padStart(2, "0")}${Math.round(color.b).toString(16).padStart(2, "0")}`;

          const tooClose = results.some((existing) => {
            const ratio = getContrastRatio(hex, existing);
            return ratio < 1.3;
          });

          if (!tooClose) {
            results.push(hex);
          }
        }

        if (results.length === 0 && sorted.length > 0) {
          for (let i = 0; i < Math.min(count, sorted.length); i++) {
            const c = sorted[i];
            results.push(`#${Math.round(c.r).toString(16).padStart(2, "0")}${Math.round(c.g).toString(16).padStart(2, "0")}${Math.round(c.b).toString(16).padStart(2, "0")}`);
          }
        }

        resolve(results);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageDataUrl;
  });
}
