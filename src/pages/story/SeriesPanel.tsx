import React, { useState } from 'react';
import { Lightbulb, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { WRITER_NAME } from '../dictation/lessonWorker';
import { createEpisode, createSeries, episodeIdeas, saveBible, type StoryBible, type StoryCharacter, type StoryEpisode, type StoryIdea, type StorySeries } from './storyWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// A new series: Claude builds the bible from a premise
export const NewSeries: React.FC<{ onCreated: (series: StorySeries) => void }> = ({ onCreated }) => {
  const [form, setForm] = useState({ premise: '', note: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await createSeries(form.premise.trim(), form.note.trim()));
    } catch (err) {
      alert(message(err, 'Claude chưa dựng được series'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card flex flex-col gap-4" onSubmit={submit}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>Series truyện viễn tưởng mới</h1>
        <p className="lg-meta" style={{ marginTop: 4 }}>Claude dựng "kinh thánh" của series: thế giới và luật của nó, nhân vật chính có mong muốn, điểm yếu, bí mật, các nhân vật phụ và những bí ẩn lớn của mùa. Mọi tập sau đều bám theo đây, nên sửa kỹ trước khi viết tập 1.</p>
      </div>
      <div className="form-group">
        <label className="form-label">Ý tưởng series <span className="form-required">*</span></label>
        <textarea required autoFocus rows={4} maxLength={1500} className="form-input" style={{ resize: 'vertical' }} placeholder="VD: Một kỹ sư bảo trì trên trạm vũ trụ ở vành đai sao Thổ phát hiện mỗi đêm trạm lại quay ngược về đúng 3 giờ sáng, và chỉ cô nhớ điều đó." value={form.premise} onChange={(e) => setForm({ ...form, premise: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">Yêu cầu thêm</label>
        <textarea rows={2} maxLength={800} className="form-input" style={{ resize: 'vertical' }} placeholder="VD: giọng kể lạnh, ít nhân vật, không có người ngoài hành tinh" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={busy || !form.premise.trim()}>{busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} {busy ? 'Claude đang dựng series (2–3 phút)...' : 'Dựng series'}</button></div>
    </form>
  );
};

const Field: React.FC<{ label: string; value: string; rows?: number; onChange: (v: string) => void }> = ({ label, value, rows = 1, onChange }) => (
  <label className="sr-field">{label}
    {rows > 1 ? <textarea className="form-input" rows={rows} style={{ resize: 'vertical' }} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className="form-input" value={value} onChange={(e) => onChange(e.target.value)} />}
  </label>
);

const lines = (items: string[]) => items.join('\n');
const unlines = (text: string) => text.split('\n').map((t) => t.trim()).filter(Boolean);

const CharacterEditor: React.FC<{ value: StoryCharacter; onChange: (c: StoryCharacter) => void; onRemove?: () => void }> = ({ value, onChange, onRemove }) => {
  const set = (patch: Partial<StoryCharacter>) => onChange({ ...value, ...patch });
  return (
    <div className="sr-character">
      <div className="sr-grid">
        <Field label="Tên" value={value.name} onChange={(name) => set({ name })} />
        <Field label="id (dùng trong kịch bản)" value={value.id} onChange={(id) => set({ id: id.toLowerCase() })} />
        <Field label="Vai trò" value={value.role} onChange={(role) => set({ role })} />
        <Field label="Cách nói" value={value.voice} onChange={(voice) => set({ voice })} />
        <Field label="Muốn" value={value.want} rows={2} onChange={(want) => set({ want })} />
        <Field label="Điểm yếu" value={value.flaw} rows={2} onChange={(flaw) => set({ flaw })} />
        <Field label="Bí mật" value={value.secret} rows={2} onChange={(secret) => set({ secret })} />
        <Field label="Ngoại hình" value={value.look} rows={2} onChange={(look) => set({ look })} />
      </div>
      {onRemove && <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onRemove}><Trash2 size={14} /> Bỏ nhân vật</button>}
    </div>
  );
};

// The series bible, editable; every episode is written against it
export const BibleEditor: React.FC<{ series: StorySeries; onSaved: (series: StorySeries) => void }> = ({ series, onSaved }) => {
  const [bible, setBible] = useState<StoryBible>(() => structuredClone(series.bible));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<StoryBible>) => { setBible({ ...bible, ...patch }); setDirty(true); };
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await saveBible(series.id, bible));
      setDirty(false);
      setErrors([]);
    } catch (err) {
      setErrors(message(err, 'Không lưu được').split('; '));
    } finally {
      setBusy(false);
    }
  };
  const blank: StoryCharacter = { id: '', name: '', role: '', look: '', voice: '', want: '', flaw: '', secret: '' };
  return (
    <details className="card">
      <summary className="sr-summary">Kinh thánh của series: thế giới, luật, nhân vật</summary>
      <div className="flex flex-col gap-4" style={{ marginTop: 12 }}>
        <div className="sr-grid">
          <Field label="Tên series" value={bible.title} onChange={(title) => set({ title })} />
          <Field label="Giọng kể" value={bible.tone} onChange={(tone) => set({ tone })} />
        </div>
        <Field label="Một câu về series" value={bible.logline} rows={2} onChange={(logline) => set({ logline })} />
        <Field label="Thế giới" value={bible.world} rows={4} onChange={(world) => set({ world })} />
        <div className="sr-grid">
          <Field label="Luật của thế giới (mỗi dòng một luật)" value={lines(bible.rules)} rows={5} onChange={(v) => set({ rules: unlines(v) })} />
          <Field label="Bí ẩn lớn của mùa (mỗi dòng một)" value={lines(bible.threads)} rows={5} onChange={(v) => set({ threads: unlines(v) })} />
        </div>
        <Field label="Phong cách tranh (bảng màu, ánh sáng, không khí)" value={bible.style} rows={2} onChange={(style) => set({ style })} />
        <b>Nhân vật chính</b>
        <CharacterEditor value={bible.protagonist} onChange={(protagonist) => set({ protagonist })} />
        <b>Nhân vật khác</b>
        {bible.cast.map((c, i) => (
          <CharacterEditor key={i} value={c} onChange={(next) => set({ cast: bible.cast.map((x, j) => (j === i ? next : x)) })} onRemove={() => set({ cast: bible.cast.filter((_, j) => j !== i) })} />
        ))}
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ cast: [...bible.cast, blank] })}><Plus size={14} /> Thêm nhân vật</button>
        {errors.length > 0 && <ul className="lg-error" style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div><button className="btn btn-primary" disabled={busy || !dirty} onClick={save}><Save size={16} /> Lưu kinh thánh</button></div>
      </div>
    </details>
  );
};

// A new episode: an idea of your own, or one of the directions Claude and Codex suggest from the series memory
export const NewEpisode: React.FC<{ series: StorySeries; onCreated: (job: StoryEpisode) => void }> = ({ series, onCreated }) => {
  const [form, setForm] = useState({ idea: '', note: '' });
  const [ideas, setIdeas] = useState<StoryIdea[]>([]);
  const [loading, setLoading] = useState<'ideas' | 'create' | null>(null);
  const brainstorm = async () => {
    setLoading('ideas');
    try {
      setIdeas(await episodeIdeas(series.id));
    } catch (err) {
      alert(message(err, 'Chưa có gợi ý'));
    } finally {
      setLoading(null);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('create');
    try {
      onCreated(await createEpisode(series.id, form.idea.trim(), form.note.trim()));
      setForm({ idea: '', note: '' });
      setIdeas([]);
    } catch (err) {
      alert(message(err, 'Không bắt đầu được tập mới'));
    } finally {
      setLoading(null);
    }
  };
  return (
    <form className="card flex flex-col gap-4" onSubmit={submit}>
      <div>
        <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Tập {series.episodes.length + 1}</h2>
        <p className="lg-meta" style={{ marginTop: 4 }}>Claude lập dàn ý, Codex chấm như biên tập viên và Claude sửa theo góp ý. Bạn duyệt dàn ý rồi mới viết kịch bản đầy đủ.</p>
      </div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" disabled={!!loading} onClick={brainstorm}>{loading === 'ideas' ? <Loader2 size={16} className="spin" /> : <Lightbulb size={16} />} {loading === 'ideas' ? 'Đang nghĩ...' : 'Gợi ý hướng cho tập này'}</button>
      </div>
      {ideas.length > 0 && (
        <div className="st-ideas">
          {ideas.map((idea, i) => (
            <div key={i} className="st-idea">
              <span className="badge">{WRITER_NAME[idea.by]}</span>
              <span style={{ fontSize: '0.9rem' }}>{idea.idea}</span>
              {idea.why && <span className="lg-meta" style={{ margin: 0 }}>{idea.why}</span>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ idea: idea.idea, note: idea.note })}>Dùng hướng này</button>
            </div>
          ))}
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Chuyện gì xảy ra trong tập này</label>
        <textarea rows={3} maxLength={800} className="form-input" style={{ resize: 'vertical' }} placeholder="Để trống thì Claude tự đi tiếp từ cú móc của tập trước" value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">Yêu cầu thêm</label>
        <textarea rows={2} maxLength={800} className="form-input" style={{ resize: 'vertical' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={!!loading}><Sparkles size={16} /> Lập dàn ý</button></div>
    </form>
  );
};

export const EpisodeMemoryList: React.FC<{ series: StorySeries }> = ({ series }) => (
  series.episodes.length === 0 ? null : (
    <div className="card">
      <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Series nhớ gì</h2>
      <p className="lg-meta" style={{ margin: '2px 0 8px' }}>Mỗi tập đã render được ghi lại; tập sau đọc những dòng này để liền mạch.</p>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {series.episodes.map((e) => (
          <li key={e.jobId}><b>{e.title}</b>: {e.summary} <span className="lg-meta">Kết: {e.cliffhanger}</span></li>
        ))}
      </ol>
    </div>
  )
);
