// Scoring follows @hyrious/fuzzy-match and the public-domain fts_fuzzy_match.
// Dynamic programming bounds the work to pattern length × title length.
export function fuzzyMatch(pattern: string, text: string): number {
	if (!pattern.length) return 100;
	if (pattern.length > text.length) return -Infinity;
	let previous = new Float64Array(text.length).fill(-Infinity);
	let current = new Float64Array(text.length);
	for (let p = 0; p < pattern.length; p++) {
		current.fill(-Infinity);
		const character = pattern[p].toUpperCase();
		let best = -Infinity;
		for (let index = 0; index < text.length; index++) {
			if (index > 0) best = Math.max(best, previous[index - 1]);
			if (text[index].toUpperCase() != character) continue;
			const boundary = boundaryBonus(text, index);
			if (p == 0) {
				current[index] = index == 0 ? 15 : Math.max(-5 * index, -15) + boundary;
			} else if (index > 0) {
				current[index] = Math.max(best, previous[index - 1] + 15) + boundary;
			}
		}
		[previous, current] = [current, previous];
	}
	let best = -Infinity;
	for (const score of previous) best = Math.max(best, score);
	return 100 - (text.length - pattern.length) + best;
}

function boundaryBonus(text: string, index: number): number {
	const code = text.charCodeAt(index);
	const previous = text.charCodeAt(index - 1);
	const upper = code >= 65 && code <= 90;
	const lower = code >= 97 && code <= 122;
	const digit = code >= 48 && code <= 57;
	const previousLower = previous >= 97 && previous <= 122;
	const previousAlphanumeric = previousLower || previous >= 65 && previous <= 90 || previous >= 48 && previous <= 57;
	return (upper && previousLower ? 30 : 0) + ((upper || lower || digit) && !previousAlphanumeric ? 30 : 0);
}
