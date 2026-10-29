// Sentence grading for Dictation — must stay in sync with src/doc/dictation-api.md section 4

export type DiffType = 'MATCH' | 'WRONG' | 'MISSING' | 'EXTRA';

export interface DiffOp {
  type: DiffType;
  expected?: string;
  actual?: string;
}

export interface GradeResult {
  isCorrect: boolean;
  accuracy: number;
  diff: DiffOp[];
}

export const tokenize = (text: string): string[] =>
  text
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, ' ')
    .toLowerCase()
    .replace(/[.,!?;:"()[\]{}…]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);

// Contractions: "I am" = "I'm", "it isn't" = "it is not" = "it's not", "do not" = "don't", "cannot" = "can't".
// Both sides are rewritten to one canonical form, so either spelling is accepted:
// 1. expand "n't" → "<aux> not"; 2. contract pronoun + auxiliary ("i am" → "i'm"), except has/have/had/will/would
// before "not" ("he hasn't", not "he's not"); 3. re-contract the remaining "<aux> not" ("do not" → "don't").
const NEGATIVE_AUX = ['is', 'are', 'was', 'were', 'do', 'does', 'did', 'has', 'have', 'had', 'would', 'should', 'could', 'must', 'need', 'might'];
const NEGATIVE_IRREGULAR: Record<string, string> = { will: "won't", can: "can't", shall: "shan't" };
const NEGATIVE_EXPAND: Record<string, string[]> = { "won't": ['will', 'not'], "can't": ['can', 'not'], cannot: ['can', 'not'], "shan't": ['shall', 'not'] };
const IS_SUBJECTS = ['he', 'she', 'it', 'that', 'there', 'here', 'what', 'where', 'who', 'how', 'when', 'why'];
const WILL_SUBJECTS = ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'that', 'there', 'who', 'what'];
const PRONOUN_AUX: Record<string, { suffix: string; subjects: string[] }> = {
  am: { suffix: "'m", subjects: ['i'] },
  are: { suffix: "'re", subjects: ['you', 'we', 'they'] },
  is: { suffix: "'s", subjects: IS_SUBJECTS },
  has: { suffix: "'s", subjects: IS_SUBJECTS },
  have: { suffix: "'ve", subjects: ['i', 'you', 'we', 'they'] },
  will: { suffix: "'ll", subjects: WILL_SUBJECTS },
  would: { suffix: "'d", subjects: WILL_SUBJECTS },
  had: { suffix: "'d", subjects: WILL_SUBJECTS }
};
const KEEP_BEFORE_NOT = ['has', 'have', 'had', 'will', 'would'];

export const normalizeContractions = (tokens: string[]): string[] => {
  const expanded = tokens.flatMap((w) => {
    if (NEGATIVE_EXPAND[w]) return NEGATIVE_EXPAND[w];
    const stem = w.endsWith("n't") ? w.slice(0, -3) : '';
    return NEGATIVE_AUX.includes(stem) ? [stem, 'not'] : [w];
  });

  const contracted: string[] = [];
  for (let i = 0; i < expanded.length; i++) {
    const [w, next, after] = [expanded[i], expanded[i + 1], expanded[i + 2]];
    const aux = next ? PRONOUN_AUX[next] : undefined;
    if (aux?.subjects.includes(w) && !(KEEP_BEFORE_NOT.includes(next) && after === 'not')) {
      contracted.push(w + aux.suffix);
      i++;
    } else if (w === 'let' && next === 'us') {
      contracted.push("let's");
      i++;
    } else {
      contracted.push(w);
    }
  }

  const result: string[] = [];
  for (let i = 0; i < contracted.length; i++) {
    const w = contracted[i];
    if (contracted[i + 1] === 'not' && (NEGATIVE_IRREGULAR[w] || NEGATIVE_AUX.includes(w))) {
      result.push(NEGATIVE_IRREGULAR[w] || `${w}n't`);
      i++;
    } else {
      result.push(w);
    }
  }
  return result;
};

export const grade = (expectedText: string, actualText: string): GradeResult => {
  const expected = normalizeContractions(tokenize(expectedText));
  const actual = normalizeContractions(tokenize(actualText));
  const n = expected.length;
  const m = actual.length;

  // LCS table over words
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = expected[i] === actual[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const raw: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && expected[i] === actual[j]) {
      raw.push({ type: 'MATCH', expected: expected[i++], actual: actual[j++] });
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      raw.push({ type: 'EXTRA', actual: actual[j++] });
    } else {
      raw.push({ type: 'MISSING', expected: expected[i++] });
    }
  }

  // Pair adjacent runs of MISSING and EXTRA into WRONG
  const diff: DiffOp[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === 'MATCH') {
      diff.push(raw[k++]);
      continue;
    }
    const missing: string[] = [];
    const extra: string[] = [];
    while (k < raw.length && raw[k].type !== 'MATCH') {
      if (raw[k].type === 'MISSING') missing.push(raw[k].expected as string);
      else extra.push(raw[k].actual as string);
      k++;
    }
    const pairs = Math.min(missing.length, extra.length);
    for (let p = 0; p < pairs; p++) diff.push({ type: 'WRONG', expected: missing[p], actual: extra[p] });
    missing.slice(pairs).forEach((w) => diff.push({ type: 'MISSING', expected: w }));
    extra.slice(pairs).forEach((w) => diff.push({ type: 'EXTRA', actual: w }));
  }

  const matches = diff.filter((d) => d.type === 'MATCH').length;
  return {
    isCorrect: n > 0 && n === m && matches === n,
    accuracy: n === 0 ? 0 : Math.round((matches / n) * 100),
    diff
  };
};

// Split a pasted paragraph into sentences. A line "English | Tiếng Việt" keeps its translation.
export const splitSentences = (raw: string): { text: string; translation: string }[] => {
  const items: { text: string; translation: string }[] = [];
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const pipe = trimmed.indexOf('|');
    if (pipe !== -1) {
      const text = trimmed.slice(0, pipe).trim();
      if (text) items.push({ text, translation: trimmed.slice(pipe + 1).trim() });
      return;
    }
    (trimmed.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [])
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text) => items.push({ text, translation: '' }));
  });
  return items;
};

// ---------- vocabulary (game) — mirrors vdev-be dictation-vocabulary.util.ts ----------

export interface Vocabulary {
  term: string;
  meaning: string;
}

// Same normalization as sentence grading, so "Large latte!" matches "large latte" and "I am" matches "I'm"
export const vocabularyKey = (term: string) => normalizeContractions(tokenize(term)).join(' ');

// Textarea format: one "term: meaning" (or "term = meaning") per line; duplicates keep the first
export const parseVocabularyText = (text: string): { items: Vocabulary[]; invalid: string[] } => {
  const items: Vocabulary[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  text.split(/[;\n]/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const match = /^(.*?)\s*[:=]\s*(.*)$/.exec(line);
    const term = match?.[1].trim() || '';
    const meaning = match?.[2].trim() || '';
    if (!vocabularyKey(term) || !meaning) {
      invalid.push(line);
      return;
    }
    const key = vocabularyKey(term);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ term, meaning });
  });
  return { items, invalid };
};

export const formatVocabularyText = (items: Vocabulary[] = []) => items.map((v) => `${v.term}: ${v.meaning}`).join('\n');
