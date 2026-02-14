import type { GeneratedPersona, DiversityMode } from "./types";

const ATTITUDES = ["cooperative", "reluctant", "neutral", "evasive", "enthusiastic"] as const;
const VERBOSITIES = ["low", "medium", "high"] as const;
const DOMAIN_KNOWLEDGE = ["none", "basic", "intermediate", "expert"] as const;

interface ValidationResult {
  valid: boolean;
  errors: string[];
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

export function validatePersonaDiversity(
  personas: GeneratedPersona[],
  diversityMode: DiversityMode,
): ValidationResult {
  const errors: string[] = [];
  const count = personas.length;

  if (count < 2) {
    return { valid: true, errors: [] };
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

  return { valid: errors.length === 0, errors };
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
