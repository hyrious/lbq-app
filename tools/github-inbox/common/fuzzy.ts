// Ported from @hyrious/fuzzy-match (MIT @ hyrious), derived from
// fts_fuzzy_match v0.2.0 by Forrest Smith (public domain).

const i_min = -Infinity;

export interface Trace {
  score: number;
  stops: number[];
}

function isUpper(index: number, str: string): boolean {
  const code = str.charCodeAt(index);
  return 65 <= code && code <= 90;
}

function isLower(index: number, str: string): boolean {
  const code = str.charCodeAt(index);
  return 97 <= code && code <= 122;
}

function isAlnum(index: number, str: string): boolean {
  const code = str.charCodeAt(index);
  return (97 <= code && code <= 122) || (65 <= code && code <= 90) || (48 <= code && code <= 57);
}

function computeScore(jump: number, firstChar: boolean, match: number, str: string): number {
  const adjacencyBonus = 15;
  const separatorBonus = 30;
  const camelBonus = 30;
  const firstLetterBonus = 15;

  const leadingLetterPenalty = -5;
  const maxLeadingLetterPenalty = -15;

  let score = 0;

  if (!firstChar && jump == 0) score += adjacencyBonus;
  if (!firstChar || jump > 0) {
    if (isUpper(match, str) && isLower(match - 1, str)) score += camelBonus;
    if (isAlnum(match, str) && !isAlnum(match - 1, str)) score += separatorBonus;
  }
  if (firstChar && jump == 0) score += firstLetterBonus;
  if (firstChar) score += Math.max(leadingLetterPenalty * jump, maxLeadingLetterPenalty);

  return score;
}

function traceRecurse(pIndex: number, pLen: number, sIndex: number, pattern: string, str: string,
  upperStr: string, score: number, firstChar: boolean, trace: number[]): number {
  if (pIndex == pLen) return score;

  let match = sIndex - 1;
  let bestScore = i_min;

  const search = pattern[pIndex].toUpperCase();
  while ((match = upperStr.indexOf(search, match + 1)) != -1) {
    const subScore = traceRecurse(pIndex + 1, pLen, match + 1, pattern, str, upperStr,
      computeScore(match - sIndex, firstChar, match, str), false, trace);
    if (bestScore < subScore) {
      bestScore = subScore;
      trace[pIndex] = match;
    }
  }

  return bestScore == i_min ? i_min : score + bestScore;
}

/** Returns the score and matched char indexes, or null when pattern does not match str. */
export function matchTrace(pattern: string, str: string): Trace | null {
  const unmatchedLetterPenalty = -1;
  const sLen = str.length;
  const pLen = pattern.length;
  let score = 100;

  if (pLen == 0) return { score, stops: [] };
  if (sLen < pLen) return null;

  score += unmatchedLetterPenalty * (sLen - pLen);

  const trace: number[] = Array(pLen);
  score = traceRecurse(0, pLen, 0, pattern, str, str.toUpperCase(), score, true, trace);
  return score == i_min ? null : { score, stops: trace };
}
