const BASE_STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "under",
  "and", "but", "if", "or", "because", "until", "while", "although",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "its", "our", "their",
  "this", "that", "these", "those",
  "what", "which", "who", "whom", "whose",
  "so", "just", "now", "then", "here", "there",
  "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "no", "not", "only", "same", "than", "too", "very",
  "please", "thank", "thanks", "sorry", "okay", "ok", "yes", "yeah",
]);

export const INTERVIEW_META_STOPWORDS = new Set([
  "probe", "probing", "deeper", "respondent", "ask", "asking",
  "conversation", "interview", "question", "follow", "followup",
  "explore", "exploring", "discuss", "discussing", "elaborate",
  "elaborating", "further", "topic", "about", "regarding",
  "tell", "said", "saying", "mentioned", "suggest", "suggested",
  "guide", "guidance", "next", "move", "transition",
]);

export function getKeywords(
  text: string,
  extraStopwords?: Set<string>,
): Set<string> {
  const combined = extraStopwords
    ? new Set([...BASE_STOPWORDS, ...extraStopwords])
    : BASE_STOPWORDS;

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !combined.has(w)),
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  return intersection.size / Math.min(a.size, b.size);
}
