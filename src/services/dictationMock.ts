// localStorage mock for the Dictation API (/api/dictation) — mirrors src/doc/dictation-api.md
import { grade, parseVocabularyText, vocabularyKey } from '../pages/dictation/grading';

const STORAGE_KEY = 'mock_dictation';
const GAP = 1024;
const NO_MATCH = Symbol('NO_MATCH');

const genId = () => Math.random().toString(36).substring(2, 10);
const nowIso = () => new Date().toISOString();

const fail = (message: string, errorCode = 'BAD_REQUEST', errors: string[] = []): never => {
  throw new Error(JSON.stringify({ success: false, message, errorCode, errors }));
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface DB {
  sessions: any[];
  lessons: any[];
  sentences: any[];
  progress: any[]; // keyed by sentenceId (single mock user)
  attempts: any[];
}

const load = (): DB => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
const save = (db: DB) => localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

const seed = () => {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const ts = nowIso();
  const base = { createdAt: ts, updatedAt: ts, deletedAt: null };
  const sentence = (lessonId: string, i: number, text: string, translation: string, note: string | null = null, vocab = '') => ({
    ...base, id: genId(), lessonId, position: (i + 1) * GAP, text, translation, note, audioFileId: null,
    vocabularies: parseVocabularyText(vocab).items
  });
  save({
    sessions: [{ ...base, id: 'ds-1', title: 'Daily Conversation', description: 'Hội thoại hằng ngày', level: 'A2', position: GAP }],
    lessons: [
      { ...base, id: 'dl-1', sessionId: 'ds-1', title: 'At the coffee shop', description: 'Gọi đồ uống', position: GAP },
      { ...base, id: 'dl-2', sessionId: 'ds-1', title: 'Introducing yourself', description: null, position: GAP * 2 }
    ],
    sentences: [
      sentence('dl-1', 0, 'Could I get a large latte, please?', 'Cho tôi một ly latte lớn được không?', 'Could I get...? — cách gọi món lịch sự', 'large latte: ly latte lớn\nplease: làm ơn'),
      sentence('dl-1', 1, "I'd like it with oat milk.", 'Tôi muốn dùng sữa yến mạch.', "I'd like = I would like", "oat milk: sữa yến mạch\nI'd like: tôi muốn"),
      sentence('dl-1', 2, 'Is it for here or to go?', 'Uống tại đây hay mang đi?', 'to go = mang đi', 'for here: dùng tại chỗ\nto go: mang đi'),
      sentence('dl-1', 3, 'That will be five dollars.', 'Tổng cộng năm đô la.', null, 'five dollars: năm đô la'),
      sentence('dl-2', 0, 'Hi, my name is Viet.', 'Xin chào, tên tôi là Việt.', null, 'my name is: tên tôi là'),
      sentence('dl-2', 1, "I'm a software developer.", 'Tôi là lập trình viên phần mềm.', null, 'software developer: lập trình viên phần mềm'),
      sentence('dl-2', 2, 'Nice to meet you.', 'Rất vui được gặp bạn.', null, 'nice to meet you: rất vui được gặp bạn')
    ],
    progress: [],
    attempts: []
  });
};

// ---------- helpers ----------

const byPosition = (a: any, b: any) => a.position - b.position;
const alive = (x: any) => !x.deletedAt;

const emptyProgress = { status: 'NOT_STARTED', attemptCount: 0, bestAccuracy: null, lastInput: null, completedAt: null };
const progressOf = (db: DB, sentenceId: string) => {
  const p = db.progress.find((x) => x.sentenceId === sentenceId);
  if (!p) return { ...emptyProgress };
  const { sentenceId: _sentenceId, ...rest } = p;
  return rest;
};

const ensureProgress = (db: DB, sentenceId: string) => {
  let p = db.progress.find((x) => x.sentenceId === sentenceId);
  if (!p) {
    p = { sentenceId, ...emptyProgress, updatedAt: nowIso() };
    db.progress.push(p);
  }
  return p;
};

const lessonSentences = (db: DB, lessonId: string) => db.sentences.filter((s) => s.lessonId === lessonId && alive(s)).sort(byPosition);
const sessionLessons = (db: DB, sessionId: string) => db.lessons.filter((l) => l.sessionId === sessionId && alive(l)).sort(byPosition);

const sentenceView = (db: DB, s: any) => {
  const { deletedAt: _deletedAt, ...rest } = s;
  return {
    ...rest,
    vocabularies: s.vocabularies || [],
    audioUrl: s.audioFileId ? `/api/storage/files/${s.audioFileId}/download` : null,
    progress: progressOf(db, s.id)
  };
};

const lessonSummary = (db: DB, l: any) => {
  const sentences = lessonSentences(db, l.id);
  const progresses = sentences.map((s) => db.progress.find((p) => p.sentenceId === s.id)).filter(Boolean);
  const tried = progresses.filter((p: any) => p.bestAccuracy !== null);
  const { deletedAt: _deletedAt, ...rest } = l;
  return {
    ...rest,
    sentenceCount: sentences.length,
    progress: {
      completed: progresses.filter((p: any) => p.status === 'COMPLETED').length,
      skipped: progresses.filter((p: any) => p.status === 'SKIPPED').length,
      total: sentences.length,
      averageAccuracy: tried.length ? Math.round(tried.reduce((sum: number, p: any) => sum + p.bestAccuracy, 0) / tried.length) : null,
      lastPracticedAt: progresses.reduce((max: string | null, p: any) => (!max || p.updatedAt > max ? p.updatedAt : max), null)
    }
  };
};

const sessionSummary = (db: DB, s: any) => {
  const lessons = sessionLessons(db, s.id).map((l) => lessonSummary(db, l));
  const { deletedAt: _deletedAt, ...rest } = s;
  return {
    ...rest,
    lessonCount: lessons.length,
    sentenceCount: lessons.reduce((sum, l) => sum + l.sentenceCount, 0),
    progress: {
      completed: lessons.reduce((sum, l) => sum + l.progress.completed, 0),
      total: lessons.reduce((sum, l) => sum + l.progress.total, 0)
    }
  };
};

// Accepts [{ term, meaning }], ["term: meaning"], { term: meaning } or "term: meaning; ..." — see doc section 7.3
const normalizeVocabularies = (raw: any, path = 'vocabularies'): any[] => {
  if (raw === undefined || raw === null || raw === '') return [];
  let lines: string[] = [];
  if (typeof raw === 'string') lines = [raw];
  else if (Array.isArray(raw)) lines = raw.map((v) => (typeof v === 'string' ? v : `${v?.term ?? ''}: ${v?.meaning ?? ''}`));
  else if (typeof raw === 'object') lines = Object.entries(raw).map(([term, meaning]) => `${term}: ${meaning ?? ''}`);
  else fail('Validation failed', 'BADREQUEST', [`${path}: phải là mảng, object hoặc chuỗi "từ: nghĩa"`]);
  const { items, invalid } = parseVocabularyText(lines.join('\n'));
  if (invalid.length) fail('Validation failed', 'BADREQUEST', invalid.map((l) => `${path} "${l}": cần dạng "từ: nghĩa" hoặc { term, meaning }`));
  if (items.length > 20) fail('Validation failed', 'BADREQUEST', [`${path}: tối đa 20 từ vựng mỗi câu`]);
  return items;
};

// Game words: deduplicated by normalized term, in lesson → sentence order
const collectVocabularies = (sentences: any[]) => {
  const seen = new Set<string>();
  return sentences.flatMap((s) => (s.vocabularies || []).flatMap((v: any) => {
    const key = vocabularyKey(v.term);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ ...v, sentenceId: s.id, lessonId: s.lessonId, sentence: s.text, translation: s.translation }];
  }));
};

const find = (list: any[], id: string, label: string) => {
  const item = list.find((x) => x.id === id && alive(x));
  if (!item) fail(`${label} not found`, 'NOT_FOUND');
  return item;
};

const reorderByIds = (items: any[], ids: string[]) => {
  ids.forEach((id, i) => {
    const item = items.find((x) => x.id === id);
    if (item) item.position = (i + 1) * GAP;
  });
};

const nextPosition = (items: any[]) => (items.length ? items[items.length - 1].position + GAP : GAP);

const pick = (target: any, body: any, keys: string[]) => {
  keys.forEach((k) => { if (k in (body || {})) target[k] = body[k]; });
  target.updatedAt = nowIso();
};

const newSentence = (lessonId: string, item: any, position: number) => {
  const text = String(item?.text || '').trim();
  if (!text) fail('text is required');
  if (text.length > 500) fail('text tối đa 500 ký tự');
  const ts = nowIso();
  return {
    id: genId(), lessonId, position, text, translation: item.translation || null, note: item.note || null,
    vocabularies: normalizeVocabularies(item.vocabularies), audioFileId: item.audioFileId || null, createdAt: ts, updatedAt: ts, deletedAt: null
  };
};

// ---------- import (section 12) ----------

// The mock only reads JSON; the real API also accepts .xlsx. Body is { fileName, content } instead of multipart.
const parseImport = (body: any) => {
  const fileName = String(body?.fileName || '').toLowerCase();
  if (fileName.endsWith('.xlsx')) fail('Chế độ offline (mock) chỉ đọc được file .json — file .xlsx cần backend thật');
  if (!fileName.endsWith('.json')) fail('Chỉ hỗ trợ file .json hoặc .xlsx');
  let raw: any;
  try {
    raw = JSON.parse(body?.content || '');
  } catch {
    fail('JSON sai cú pháp');
  }
  const list = Array.isArray(raw) ? raw : raw?.sessions;
  if (!Array.isArray(list)) fail('Validation failed', 'BADREQUEST', ['Cần một mảng session hoặc object { "sessions": [...] }']);

  const errors: string[] = [];
  const err = (msg: string) => { if (errors.length < 100) errors.push(msg); };
  const str = (v: any) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
  let sentenceTotal = 0;

  const sessions = list.map((s: any, i: number) => {
    const path = `sessions[${i}]`;
    const title = str(s?.title);
    if (!title) err(`${path}: thiếu tên session (title)`);
    else if (title.length > 200) err(`${path}: title tối đa 200 ký tự`);
    const level = str(s?.level).toUpperCase() || 'A1';
    if (!LEVELS.includes(level)) err(`${path}: level "${s.level}" không hợp lệ (${LEVELS.join(', ')})`);
    if (s?.lessons !== undefined && !Array.isArray(s.lessons)) err(`${path}.lessons: phải là mảng`);
    const lessons = (Array.isArray(s?.lessons) ? s.lessons : []).map((l: any, j: number) => {
      const lPath = `${path}.lessons[${j}]`;
      const lTitle = str(l?.title);
      if (!lTitle) err(`${lPath}: thiếu tên bài (title)`);
      else if (lTitle.length > 200) err(`${lPath}: title tối đa 200 ký tự`);
      if (l?.sentences !== undefined && !Array.isArray(l.sentences)) err(`${lPath}.sentences: phải là mảng`);
      const sentences = (Array.isArray(l?.sentences) ? l.sentences : []).map((item: any, k: number) => {
        const sPath = `${lPath}.sentences[${k}]`;
        const obj = typeof item === 'string' ? { text: item } : item || {};
        const text = str(obj.text);
        if (!text) err(`${sPath}: thiếu câu (text)`);
        else if (text.length > 500) err(`${sPath}: câu tối đa 500 ký tự`);
        let vocabularies: any[] = [];
        try {
          vocabularies = normalizeVocabularies(obj.vocabularies, `${sPath}.vocabularies`);
        } catch (e: any) {
          JSON.parse(e.message).errors.forEach(err);
        }
        return { text, translation: str(obj.translation) || null, note: str(obj.note) || null, vocabularies };
      });
      sentenceTotal += sentences.length;
      return { title: lTitle, description: str(l?.description) || null, sentences };
    });
    return { title, description: str(s?.description) || null, level, lessons };
  });

  if (sessions.length > 50) err('Tối đa 50 session mỗi lần import');
  if (sentenceTotal > 5000) err('Tối đa 5000 câu mỗi lần import');
  if (errors.length) fail('Validation failed', 'BADREQUEST', errors);
  return sessions;
};

const importSessions = (db: DB, body: any, dryRun: boolean) => {
  const parsed = parseImport(body);
  const summary = {
    sessions: parsed.length,
    lessons: parsed.reduce((n: number, s: any) => n + s.lessons.length, 0),
    sentences: parsed.reduce((n: number, s: any) => n + s.lessons.reduce((m: number, l: any) => m + l.sentences.length, 0), 0),
    vocabularies: parsed.reduce((n: number, s: any) => n + s.lessons.reduce((m: number, l: any) => m + l.sentences.reduce((k: number, t: any) => k + t.vocabularies.length, 0), 0), 0)
  };
  if (dryRun) {
    return {
      dryRun: true,
      summary,
      sessions: parsed.map((s: any) => ({
        title: s.title, description: s.description, level: s.level,
        lessonCount: s.lessons.length,
        sentenceCount: s.lessons.reduce((m: number, l: any) => m + l.sentences.length, 0),
        lessons: s.lessons.map((l: any) => ({ title: l.title, sentenceCount: l.sentences.length }))
      }))
    };
  }
  const ts = nowIso();
  let sessionPos = nextPosition(db.sessions.filter(alive).sort(byPosition));
  const created = parsed.map((s: any) => {
    const session = { id: genId(), title: s.title, description: s.description, level: s.level, position: sessionPos, createdAt: ts, updatedAt: ts, deletedAt: null };
    sessionPos += GAP;
    db.sessions.push(session);
    s.lessons.forEach((l: any, j: number) => {
      const lesson = { id: genId(), sessionId: session.id, title: l.title, description: l.description, position: (j + 1) * GAP, createdAt: ts, updatedAt: ts, deletedAt: null };
      db.lessons.push(lesson);
      l.sentences.forEach((item: any, k: number) => db.sentences.push(newSentence(lesson.id, item, (k + 1) * GAP)));
    });
    return session;
  });
  return { dryRun: false, summary, sessions: created.map((s: any) => sessionSummary(db, s)) };
};

// ---------- routes ----------

const route = (method: string, url: string, body?: any): any => {
  const urlObj = new URL(url, 'http://localhost');
  const seg = urlObj.pathname.split('/').filter(Boolean);
  if (seg[0] !== 'api' || seg[1] !== 'dictation') return NO_MATCH;
  const [resource, id, sub, subId] = seg.slice(2);
  const db = load();
  let result: any = NO_MATCH;

  if (resource === 'sessions') {
    if (!id && method === 'GET') result = db.sessions.filter(alive).sort(byPosition).map((s) => sessionSummary(db, s));
    else if (!id && method === 'POST') {
      if (!body?.title?.trim()) fail('title is required');
      const ts = nowIso();
      const s = {
        id: genId(), title: body.title.trim(), description: body.description || null, level: body.level || 'A1',
        position: nextPosition(db.sessions.filter(alive).sort(byPosition)), createdAt: ts, updatedAt: ts, deletedAt: null
      };
      db.sessions.push(s);
      result = sessionSummary(db, s);
    } else if (id === 'import' && !sub && method === 'POST') {
      result = importSessions(db, body, urlObj.searchParams.get('dryRun') === 'true');
    } else if (id === 'reorder' && method === 'PATCH') {
      reorderByIds(db.sessions, body?.ids || []);
      result = db.sessions.filter(alive).sort(byPosition).map((s) => sessionSummary(db, s));
    } else if (id) {
      const session = find(db.sessions, id, 'Session');
      if (!sub && method === 'GET') result = { ...sessionSummary(db, session), lessons: sessionLessons(db, id).map((l) => lessonSummary(db, l)) };
      else if (!sub && method === 'PATCH') { pick(session, body, ['title', 'description', 'level']); result = sessionSummary(db, session); }
      else if (!sub && method === 'DELETE') {
        const ts = nowIso();
        session.deletedAt = ts;
        db.lessons.filter((l) => l.sessionId === id).forEach((l) => {
          l.deletedAt = l.deletedAt || ts;
          db.sentences.filter((s) => s.lessonId === l.id).forEach((s) => { s.deletedAt = s.deletedAt || ts; });
        });
        result = { success: true };
      } else if (sub === 'lessons' && !subId && method === 'POST') {
        if (!body?.title?.trim()) fail('title is required');
        const ts = nowIso();
        const l = {
          id: genId(), sessionId: id, title: body.title.trim(), description: body.description || null,
          position: nextPosition(sessionLessons(db, id)), createdAt: ts, updatedAt: ts, deletedAt: null
        };
        db.lessons.push(l);
        result = lessonSummary(db, l);
      } else if (sub === 'vocabularies' && method === 'GET') {
        result = collectVocabularies(sessionLessons(db, id).flatMap((l) => lessonSentences(db, l.id)));
      } else if (sub === 'lessons' && subId === 'reorder' && method === 'PATCH') {
        reorderByIds(db.lessons, body?.ids || []);
        result = sessionLessons(db, id).map((l) => lessonSummary(db, l));
      }
    }
  }

  if (resource === 'lessons' && id) {
    const lesson = find(db.lessons, id, 'Lesson');
    const detail = () => {
      const session = db.sessions.find((s) => s.id === lesson.sessionId);
      return {
        ...lessonSummary(db, lesson),
        session: session ? { id: session.id, title: session.title } : null,
        sentences: lessonSentences(db, id).map((s) => sentenceView(db, s))
      };
    };
    if (!sub && method === 'GET') result = detail();
    else if (!sub && method === 'PATCH') { pick(lesson, body, ['title', 'description']); result = lessonSummary(db, lesson); }
    else if (!sub && method === 'DELETE') {
      const ts = nowIso();
      lesson.deletedAt = ts;
      db.sentences.filter((s) => s.lessonId === id).forEach((s) => { s.deletedAt = s.deletedAt || ts; });
      result = { success: true };
    } else if (sub === 'vocabularies' && method === 'GET') {
      result = collectVocabularies(lessonSentences(db, id));
    } else if (sub === 'reset-progress' && method === 'POST') {
      const ids = new Set(lessonSentences(db, id).map((s) => s.id));
      db.progress = db.progress.filter((p) => !ids.has(p.sentenceId));
      result = detail();
    } else if (sub === 'sentences' && !subId && method === 'POST') {
      const s = newSentence(id, body, nextPosition(lessonSentences(db, id)));
      db.sentences.push(s);
      result = sentenceView(db, s);
    } else if (sub === 'sentences' && subId === 'bulk' && method === 'POST') {
      const items = body?.items || [];
      if (!items.length) fail('items is required');
      if (items.length > 200) fail('Tối đa 200 câu mỗi lần');
      let position = nextPosition(lessonSentences(db, id));
      const created = items.map((item: any) => {
        const s = newSentence(id, item, position);
        position += GAP;
        return s;
      });
      db.sentences.push(...created);
      result = created.map((s: any) => sentenceView(db, s));
    } else if (sub === 'sentences' && subId === 'reorder' && method === 'PATCH') {
      reorderByIds(db.sentences, body?.ids || []);
      result = lessonSentences(db, id).map((s) => sentenceView(db, s));
    }
  }

  if (resource === 'sentences' && id) {
    const sentence = find(db.sentences, id, 'Sentence');
    if (!sub && method === 'PATCH') {
      if ('text' in (body || {}) && !String(body.text || '').trim()) fail('text is required');
      if ('vocabularies' in (body || {})) body = { ...body, vocabularies: normalizeVocabularies(body.vocabularies) };
      pick(sentence, body, ['text', 'translation', 'note', 'vocabularies', 'audioFileId']);
      result = sentenceView(db, sentence);
    } else if (!sub && method === 'DELETE') {
      sentence.deletedAt = nowIso();
      result = { success: true };
    } else if (sub === 'attempts' && method === 'POST') {
      const g = grade(sentence.text, String(body?.input || ''));
      const ts = nowIso();
      const attempt = {
        id: genId(), sentenceId: id, input: body?.input || '', isCorrect: g.isCorrect, accuracy: g.accuracy, diff: g.diff,
        playCount: body?.playCount || 0, hintCount: body?.hintCount || 0, revealed: !!body?.revealed, durationMs: body?.durationMs || 0, createdAt: ts
      };
      db.attempts.push(attempt);
      const p = ensureProgress(db, id);
      p.attemptCount += 1;
      p.bestAccuracy = Math.max(p.bestAccuracy ?? 0, g.accuracy);
      p.lastInput = attempt.input;
      p.updatedAt = ts;
      if (g.isCorrect) {
        p.status = 'COMPLETED';
        p.completedAt = p.completedAt || ts;
      } else if (p.status !== 'COMPLETED') {
        p.status = attempt.revealed ? 'SKIPPED' : 'IN_PROGRESS';
      }
      const { sentenceId: _sid, input: _input, playCount: _pc, hintCount: _hc, revealed: _rv, durationMs: _dm, ...attemptView } = attempt;
      result = { attempt: attemptView, progress: progressOf(db, id) };
    } else if (sub === 'attempts' && method === 'GET') {
      const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);
      result = db.attempts.filter((a) => a.sentenceId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    } else if (sub === 'skip' && method === 'POST') {
      const p = ensureProgress(db, id);
      if (p.status !== 'COMPLETED') p.status = 'SKIPPED';
      p.updatedAt = nowIso();
      result = progressOf(db, id);
    }
  }

  if (result !== NO_MATCH && method !== 'GET') save(db);
  return result;
};

export const mockDictation = (method: string, url: string, body?: any): { handled: boolean; data?: any } => {
  seed();
  const data = route(method, url, body);
  return data === NO_MATCH ? { handled: false } : { handled: true, data };
};
