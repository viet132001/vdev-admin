// Where the mistakes are in what the learner typed, as text ranges, so the keyboard can jump straight to them.
// Kept out of grading.ts: that file mirrors the BE grader 1:1, this one only serves the editor.
import { grade, normalizeTokens, tokenize } from './grading';

export interface Spot {
  start: number;
  end: number; // equal to start: a missing word, the caret sits where it should be typed
}

// Same steps as tokenize(), but keeping where each word sits. Every replacement in tokenize() swaps one character
// for one character, so offsets in the cleaned string are offsets in the original.
const tokenOffsets = (text: string): Spot[] => {
  const cleaned = text
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, ' ')
    .replace(/[.,!?;:"()[\]{}…]/g, ' ');
  const spots: Spot[] = [];
  for (const match of cleaned.matchAll(/\S+/g)) {
    const word = match[0];
    const lead = word.length - word.replace(/^['-]+/, '').length;
    const trail = word.length - word.replace(/['-]+$/, '').length;
    if (lead + trail >= word.length) continue;
    spots.push({ start: match.index + lead, end: match.index + word.length - trail });
  }
  return spots;
};

export const errorSpots = (expected: string, input: string): Spot[] => {
  const words = tokenOffsets(input);
  // Contractions and numbers can merge or split words ("i am" → "i'm"): then the diff no longer lines up with
  // what was typed word for word, and no spot is better than a wrong one
  if (words.length !== tokenize(input).length || words.length !== normalizeTokens(tokenize(input)).length) return [];
  const spots: Spot[] = [];
  let j = 0;
  for (const op of grade(expected, input).diff) {
    if (op.type === 'MATCH') j++;
    else if (op.type === 'WRONG' || op.type === 'EXTRA') spots.push(words[j++]);
    else {
      // Before the next typed word, or after the last one
      const at = j < words.length ? words[j].start : input.trimEnd().length;
      if (spots.at(-1)?.start !== at) spots.push({ start: at, end: at });
    }
  }
  return spots;
};
