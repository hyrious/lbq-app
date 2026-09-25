import { element } from './renderer.ts';
import { matchTrace, type Trace } from './fuzzy.ts';

/**
 * Runs the fuzzy matcher across every candidate label and keeps the best
 * trace, so callers can score and highlight without re-running the search.
 */
export function bestMatch(query: string, labels: readonly (string | undefined)[]): Trace | null {
  let best: Trace | null = null;
  for (const label of labels) {
    if (!label) continue;
    const trace = matchTrace(query, label);
    if (trace && (!best || trace.score > best.score)) best = trace;
  }
  return best;
}

/** Returns the best score for a set of labels, or -Infinity when nothing matches. */
export function bestScore(query: string, labels: readonly (string | undefined)[]): number {
  return bestMatch(query, labels)?.score ?? -Infinity;
}

/**
 * Splits `text` into plain strings and `<mark>` nodes at the matched
 * positions. Falls back to the untouched text when it does not match.
 */
export function highlight(query: string, text: string): (Node | string)[] {
  const trace = query ? matchTrace(query, text) : null;
  if (!trace) return [text];
  const nodes: (Node | string)[] = [];
  let start = 0;
  for (const stop of trace.stops) {
    if (stop > start) nodes.push(text.slice(start, stop));
    nodes.push(element('mark', '', text[stop]));
    start = stop + 1;
  }
  if (start < text.length) nodes.push(text.slice(start));
  return nodes;
}
