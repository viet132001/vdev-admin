import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Clapperboard, Loader2, Paintbrush, Plus, Save, Trash2 } from 'lucide-react';
import { ReviewCard } from './OutlineView';
import {
  CAMERAS, CAMERA_LABEL, LIMITS, MOODS, MOOD_LABEL, NARRATOR, artUrl, minutes, paintStoryArt, renderEpisode, saveStoryScript, syllables,
  type StoryBible, type StoryEpisode, type StoryLine, type StoryScene, type StoryScript, type StoryShort
} from './storyWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const move = <T,>(list: T[], i: number, dir: -1 | 1) => { const next = [...list]; [next[i], next[i + dir]] = [next[i + dir], next[i]]; return next; };

const LineEditor: React.FC<{ line: StoryLine; speakers: { id: string; name: string }[]; first: boolean; last: boolean; onChange: (l: StoryLine) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }> = ({ line, speakers, first, last, onChange, onMove, onRemove }) => (
  <div className="sr-line">
    <div className="sr-line-head">
      <select className="form-input" value={line.speaker} onChange={(e) => onChange({ ...line, speaker: e.target.value })}>
        {speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="form-input" value={line.mood} onChange={(e) => onChange({ ...line, mood: e.target.value })}>
        {MOODS.map((m) => <option key={m} value={m}>{MOOD_LABEL[m]}</option>)}
      </select>
      <input type="number" min={0} max={3} step={0.1} className="form-input" title="Im trước câu (giây)" placeholder="Im (s)" value={line.pause ?? ''} onChange={(e) => onChange({ ...line, pause: e.target.value === '' ? null : Math.max(0, Math.min(3, Number(e.target.value))) })} />
      <div className="st-line-tools">
        <button className="icon-btn" title="Lên" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
        <button className="icon-btn" title="Xuống" disabled={last} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
        <button className="icon-btn" title="Xoá câu" onClick={onRemove}><Trash2 size={14} /></button>
      </div>
    </div>
    <textarea className="form-input" rows={2} maxLength={320} style={{ resize: 'vertical' }} value={line.text} onChange={(e) => onChange({ ...line, text: e.target.value })} />
  </div>
);

export const ScriptEditor: React.FC<{ job: StoryEpisode; bible: StoryBible; onChange: (job: StoryEpisode) => void }> = ({ job, bible, onChange }) => {
  const story = job.story!;
  const [script, setScript] = useState<StoryScript>(() => structuredClone(story.script!));
  const [short, setShort] = useState<StoryShort>(() => structuredClone(story.short!));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<'save' | 'render' | 'paint' | null>(null);
  const [painting, setPainting] = useState<{ scene: number; id: string; description: string } | null>(null);
  const [artVersion, setArtVersion] = useState(0);

  // A new job, or the worker finished something: take its copy unless there are edits here
  useEffect(() => {
    if (dirty) return;
    setScript(structuredClone(story.script!));
    setShort(structuredClone(story.short!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.updatedAt]);

  const posted = !!(job.facebook && job.facebook.status !== 'FAILED') || !!(job.youtube && job.youtube.status !== 'FAILED');
  const speakers = useMemo(() => [{ id: NARRATOR, name: 'Người dẫn truyện' }, ...[bible.protagonist, ...bible.cast].map((c) => ({ id: c.id, name: c.name }))], [bible]);
  const arts = [...new Set(script.scenes.map((s) => s.art))];
  const fullCount = script.scenes.reduce((n, s) => n + s.lines.reduce((m, l) => m + syllables(l.text), 0), 0);
  const shortCount = short.lines.reduce((n, l) => n + syllables(l.text), 0) + syllables(short.cta);
  const editScript = (next: StoryScript) => { setScript(next); setDirty(true); };
  const editShort = (next: StoryShort) => { setShort(next); setDirty(true); };
  const setScene = (i: number, patch: Partial<StoryScene>) => editScript({ ...script, scenes: script.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const save = async () => {
    setBusy('save');
    try {
      const next = await saveStoryScript(job.id, script, short);
      setDirty(false);
      setErrors([]);
      onChange(next);
      return true;
    } catch (err) {
      setErrors(message(err, 'Không lưu được').split('; '));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const render = async () => {
    if (dirty && !(await save())) return;
    setBusy('render');
    try {
      onChange(await renderEpisode(job.id));
    } catch (err) {
      alert(message(err, 'Không render được'));
    } finally {
      setBusy(null);
    }
  };
  const paint = async () => {
    if (!painting) return;
    setBusy('paint');
    try {
      const { id } = await paintStoryArt(job.id, painting.id.trim().toLowerCase(), painting.description.trim());
      setScene(painting.scene, { art: id });
      setArtVersion((v) => v + 1);
      setPainting(null);
    } catch (err) {
      alert(message(err, 'Claude chưa vẽ được tranh'));
    } finally {
      setBusy(null);
    }
  };

  const tone = (count: number, range: { min: number; max: number }) => (count < range.min || count > range.max ? 'var(--danger)' : 'var(--text-muted)');

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-2">
        <ReviewCard title="Biên tập viên chấm kịch bản (chỗ người xem bỏ đi)" review={story.scriptReview} polished={story.scriptPolished} />
      </div>

      <div className="card flex flex-col gap-4">
        <div className="flex justify-between align-center gap-2" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Bản đầy đủ · YouTube</h2>
          <span style={{ fontSize: '0.85rem', color: tone(fullCount, LIMITS.full) }}>{fullCount} tiếng · khoảng {minutes(fullCount)} phút (cần {LIMITS.full.min}–{LIMITS.full.max})</span>
        </div>
        <div className="sr-grid">
          <label className="sr-field">Tên tập<input className="form-input" maxLength={100} value={script.title} disabled={posted} onChange={(e) => editScript({ ...script, title: e.target.value })} /></label>
          <label className="sr-field">Câu trên màn cuối<input className="form-input" maxLength={200} value={script.ending} disabled={posted} onChange={(e) => editScript({ ...script, ending: e.target.value })} /></label>
        </div>
        {script.scenes.map((scene, s) => (
          <div key={s} className="sr-scene">
            <img className="sr-art" src={artUrl(job.id, scene.art, artVersion)} alt={scene.art} loading="lazy" />
            <div className="flex flex-col gap-2" style={{ minWidth: 0 }}>
              <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
                <b>Cảnh {s + 1}</b>
                <select className="form-input sr-small" value={scene.art} onChange={(e) => setScene(s, { art: e.target.value })}>
                  {arts.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select className="form-input sr-small" value={scene.camera} onChange={(e) => setScene(s, { camera: e.target.value })}>
                  {CAMERAS.map((c) => <option key={c} value={c}>{CAMERA_LABEL[c]}</option>)}
                </select>
                <label className="lg-meta flex align-center gap-2" style={{ margin: 0 }}>Bản dọc nhìn vào
                  <input type="range" min={0} max={1} step={0.05} value={scene.focus} onChange={(e) => setScene(s, { focus: Number(e.target.value) })} />
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => setPainting({ scene: s, id: scene.art, description: '' })}><Paintbrush size={14} /> Vẽ lại / tranh mới</button>
              </div>
              <input className="form-input" maxLength={80} placeholder="Nhãn nơi chốn khi mở cảnh, VD: Trạm Cuối · năm 2187 (để trống nếu không cần)" value={scene.caption ?? ''} onChange={(e) => setScene(s, { caption: e.target.value || null })} />
              {painting?.scene === s && (
                <div className="st-paint">
                  <input className="form-input" maxLength={40} placeholder="id tranh: giữ id cũ để vẽ lại, id mới để thêm tranh" value={painting.id} onChange={(e) => setPainting({ ...painting, id: e.target.value })} />
                  <textarea rows={3} maxLength={1500} className="form-input" placeholder="Mô tả cho hoạ sĩ: nơi chốn, góc nhìn, ánh sáng, đồ vật, có bóng người không" value={painting.description} onChange={(e) => setPainting({ ...painting, description: e.target.value })} />
                  <div className="flex gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => setPainting(null)}>Huỷ</button>
                    <button className="btn btn-primary btn-sm" disabled={!!busy || !/^[a-z][a-z0-9-]{1,40}$/.test(painting.id.trim().toLowerCase()) || !painting.description.trim()} onClick={paint}>{busy === 'paint' ? <Loader2 size={14} className="spin" /> : <Paintbrush size={14} />} Claude vẽ</button>
                  </div>
                </div>
              )}
              {scene.lines.map((line, l) => (
                <LineEditor key={l} line={line} speakers={speakers} first={l === 0} last={l === scene.lines.length - 1}
                  onChange={(next) => setScene(s, { lines: scene.lines.map((x, k) => (k === l ? next : x)) })}
                  onMove={(d) => setScene(s, { lines: move(scene.lines, l, d) })}
                  onRemove={() => setScene(s, { lines: scene.lines.filter((_, k) => k !== l) })} />
              ))}
              <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setScene(s, { lines: [...scene.lines, { speaker: NARRATOR, text: '', mood: 'calm', pause: null }] })}><Plus size={14} /> Thêm câu</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card flex flex-col gap-4">
        <div className="flex justify-between align-center gap-2" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Bản ngắn · Facebook Reels</h2>
          <span style={{ fontSize: '0.85rem', color: tone(shortCount, LIMITS.short) }}>{shortCount} tiếng · khoảng {Math.round(shortCount / 3)} giây (cần 40–65)</span>
        </div>
        <label className="sr-field">Chữ ghim trên đầu khung<input className="form-input" maxLength={80} value={short.hook} onChange={(e) => editShort({ ...short, hook: e.target.value })} /></label>
        {short.lines.map((line, i) => (
          <div key={i} className="sr-short-line">
            <img className="sr-art sr-art-small" src={artUrl(job.id, line.art, artVersion)} alt={line.art} loading="lazy" />
            <div className="flex flex-col gap-2" style={{ minWidth: 0 }}>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <select className="form-input sr-small" value={line.art} onChange={(e) => editShort({ ...short, lines: short.lines.map((x, k) => (k === i ? { ...x, art: e.target.value } : x)) })}>{arts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                <select className="form-input sr-small" value={line.mood} onChange={(e) => editShort({ ...short, lines: short.lines.map((x, k) => (k === i ? { ...x, mood: e.target.value } : x)) })}>{MOODS.map((m) => <option key={m} value={m}>{MOOD_LABEL[m]}</option>)}</select>
                <button className="icon-btn" title="Xoá câu" onClick={() => editShort({ ...short, lines: short.lines.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
              </div>
              <textarea className="form-input" rows={2} maxLength={320} style={{ resize: 'vertical' }} value={line.text} onChange={(e) => editShort({ ...short, lines: short.lines.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => editShort({ ...short, lines: [...short.lines, { art: arts[0], text: '', mood: 'tense' }] })}><Plus size={14} /> Thêm câu</button>
        <label className="sr-field">Câu cuối mời xem YouTube<input className="form-input" maxLength={120} value={short.cta} onChange={(e) => editShort({ ...short, cta: e.target.value })} /></label>
      </div>

      {errors.length > 0 && <ul className="lg-error" style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {posted && <p className="lg-meta" style={{ margin: 0 }}>Tập đã đăng hoặc đã hẹn, không sửa hay render lại được nữa.</p>}
      <div className="flex gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" disabled={!!busy || !dirty || posted} onClick={save}><Save size={16} /> Lưu kịch bản</button>
        <button className="btn btn-primary" disabled={!!busy || posted} onClick={render}>{busy === 'render' ? <Loader2 size={16} className="spin" /> : <Clapperboard size={16} />} {job.status === 'DONE' ? 'Render lại cả hai bản' : 'Lồng giọng và render cả hai bản'}</button>
      </div>
    </div>
  );
};
