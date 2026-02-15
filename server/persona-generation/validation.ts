import type { GeneratedPersona, DiversityMode } from "./types";

const ATTITUDES = ["cooperative", "reluctant", "neutral", "evasive", "enthusiastic"] as const;
const VERBOSITIES = ["low", "medium", "high"] as const;
const DOMAIN_KNOWLEDGE = ["none", "basic", "intermediate", "expert"] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function countDistinct<T>(values: T[]): number {
  return new Set(values).size;
}

function maxPct<T>(values: T[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

function parseAgeRange(ageRange: string): { min: number; max: number } | null {
  const match = ageRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  const plusMatch = ageRange.match(/(\d+)\+/);
  if (plusMatch) return { min: parseInt(plusMatch[1]), max: 100 };
  const singleMatch = ageRange.match(/(\d+)/);
  if (singleMatch) {
    const n = parseInt(singleMatch[1]);
    return { min: n, max: n };
  }
  return null;
}

function validateDemographicSpread(personas: GeneratedPersona[]): string[] {
  const errors: string[] = [];
  const count = personas.length;
  if (count < 3) return errors;

  const ages = personas.map((p) => parseAgeRange(p.ageRange)).filter((a): a is { min: number; max: number } => a !== null);
  if (ages.length >= 3) {
    const midpoints = ages.map((a) => (a.min + a.max) / 2);
    const minAge = Math.min(...midpoints);
    const maxAge = Math.max(...midpoints);
    if (maxAge - minAge < 10) {
      errors.push(`age: all personas fall within a narrow range (${Math.round(minAge)}-${Math.round(maxAge)}), need more age diversity`);
    }
  }

  const genders = personas.map((p) => p.gender.toLowerCase().trim());
  if (count >= 4 && countDistinct(genders) < 2) {
    errors.push(`gender: all ${count} personas have the same gender "${genders[0]}", need at least 2 different genders`);
  }

  const locations = personas.map((p) => p.location.toLowerCase().trim());
  if (count >= 5 && countDistinct(locations) < 2) {
    errors.push(`location: all ${count} personas share the same location "${locations[0]}", need geographic diversity`);
  }

  return errors;
}

export function validatePersonaDiversity(
  personas: GeneratedPersona[],
  diversityMode: DiversityMode,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const count = personas.length;

  if (count < 2) {
    return { valid: true, errors: [], warnings: [] };
  }

  const attitudes = personas.map((p) => p.attitude);
  const verbosities = personas.map((p) => p.verbosity);
  const domainKnowledges = personas.map((p) => p.domainKnowledge);

  if (diversityMode === "balanced") {
    if (countDistinct(attitudes) < 2) {
      errors.push(`attitude: only ${countDistinct(attitudes)} distinct value(s), need at least 2`);
    }
    if (countDistinct(verbosities) < 2) {
      errors.push(`verbosity: only ${countDistinct(verbosities)} distinct value(s), need at least 2`);
    }
    if (countDistinct(domainKnowledges) < 2) {
      errors.push(`domainKnowledge: only ${countDistinct(domainKnowledges)} distinct value(s), need at least 2`);
    }
    if (maxPct(attitudes) > 0.4) {
      errors.push(`attitude: a single value is used more than 40% of the time`);
    }
    if (maxPct(verbosities) > 0.4) {
      errors.push(`verbosity: a single value is used more than 40% of the time`);
    }
    if (maxPct(domainKnowledges) > 0.4) {
      errors.push(`domainKnowledge: a single value is used more than 40% of the time`);
    }
  } else {
    const combos = new Set(personas.map((p) => `${p.attitude}|${p.verbosity}|${p.domainKnowledge}`));
    if (combos.size < count) {
      errors.push(`maximize mode: ${count - combos.size} personas share (attitude, verbosity, domainKnowledge) combinations`);
    }
    if (count >= 5) {
      if (countDistinct(attitudes) < 3) {
        errors.push(`attitude: only ${countDistinct(attitudes)} distinct value(s) with ${count} personas, need at least 3`);
      }
      if (countDistinct(verbosities) < 3) {
        errors.push(`verbosity: only ${countDistinct(verbosities)} distinct value(s) with ${count} personas, need at least 3`);
      }
      if (countDistinct(domainKnowledges) < 3) {
        errors.push(`domainKnowledge: only ${countDistinct(domainKnowledges)} distinct value(s) with ${count} personas, need at least 3`);
      }
    }
  }

  const names = personas.map((p) => p.name.toLowerCase());
  const uniqueNames = new Set(names);
  if (uniqueNames.size < count) {
    errors.push(`${count - uniqueNames.size} duplicate name(s) found`);
  }

  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const traitsI = new Set(personas[i].traits);
      const traitsJ = new Set(personas[j].traits);
      const intersection = [...traitsI].filter((t) => traitsJ.has(t));
      const overlapPct = intersection.length / Math.max(traitsI.size, traitsJ.size);
      if (overlapPct > 0.5) {
        errors.push(`personas "${personas[i].name}" and "${personas[j].name}" share more than 50% of traits`);
      }
    }
  }

  const demographicErrors = validateDemographicSpread(personas);
  errors.push(...demographicErrors);

  return { valid: errors.length === 0, errors, warnings };
}

export function buildCorrectionPrompt(errors: string[]): string {
  return `CORRECTION REQUIRED:
The previous generation failed diversity validation. Specific issues:
${errors.join("\n")}

Regenerate the persona set, ensuring:
- Each issue listed above is addressed
- All other requirements from the original prompt still apply
- Do not simply swap values randomly -- maintain realistic persona coherence`;
}
