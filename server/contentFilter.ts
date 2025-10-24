// List of prohibited words/phrases (expandable)
const PROHIBITED_WORDS = [
  // Profanity and offensive language
  "damn",
  "hell",
  "crap",
  // Scam/fraud related
  "scam",
  "fraud",
  "steal",
  "stolen",
  "illegal",
  // Spam indicators
  "click here",
  "buy now",
  "limited time",
  "act now",
  "free money",
];

export interface ContentFilterResult {
  isClean: boolean;
  flaggedWords?: string[];
  severity?: "low" | "medium" | "high";
}

/**
 * Filters content for prohibited words and phrases
 */
export function filterContent(content: string): ContentFilterResult {
  const lowerContent = content.toLowerCase();
  const flaggedWords: string[] = [];

  // Check for prohibited words
  for (const word of PROHIBITED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lowerContent)) {
      flaggedWords.push(word);
    }
  }

  if (flaggedWords.length === 0) {
    return { isClean: true };
  }

  // Determine severity based on number of flagged words
  let severity: "low" | "medium" | "high" = "low";
  if (flaggedWords.length > 3) {
    severity = "high";
  } else if (flaggedWords.length > 1) {
    severity = "medium";
  }

  return {
    isClean: false,
    flaggedWords,
    severity,
  };
}

/**
 * Sanitizes content by replacing prohibited words with asterisks
 */
export function sanitizeContent(content: string): string {
  let sanitized = content;

  for (const word of PROHIBITED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    sanitized = sanitized.replace(regex, (match) => "*".repeat(match.length));
  }

  return sanitized;
}

/**
 * Checks if content should be blocked entirely (high severity)
 */
export function shouldBlockContent(content: string): boolean {
  const result = filterContent(content);
  return !result.isClean && result.severity === "high";
}
