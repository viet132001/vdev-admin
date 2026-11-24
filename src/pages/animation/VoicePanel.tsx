import React, { useEffect, useState } from 'react';
import { Loader2, Play, Save, Sparkles } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { NARRATOR, listVoices, setVoices, suggestVoices, type AssetSeries, type VoiceInfo } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// One ElevenLabs voice per character and one for the narrator. Claude can suggest them from the account's voices;
// the choice is saved on the series and every video of it uses it.
export const VoicePanel: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void }> = ({ series, onChange }) => {
  const { busy, run } = useBusy();
  const [voices, setList] = useState<VoiceInfo[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(series.voices ?? {});
  useEffect(() => { setDraft(series.voices ?? {}); }, [series.voices]);

  const load = () => {
    if (voices) return;
    listVoices().then(setList).catch((err) => setProblem(message(err, 'Không đọc được danh sách giọng ElevenLabs')));
  };
  const who = [{ id: NARRATOR, name: 'Người kể chuyện', hint: 'Đọc phần dẫn truyện' }, ...series.bible.characters.map((c) => ({ id: c.id, name: c.name, hint: c.voice }))];
  const dirty = who.some(({ id }) => (draft[id] ?? '') !== (series.voices?.[id] ?? ''));
  const missing = who.filter(({ id }) => !series.voices?.[id]).length;

  const save = () => run('save', async () => {
    try { onChange(await setVoices(series.id, Object.fromEntries(who.map(({ id }) => [id, draft[id] ?? ''])))); } catch (err) { alert(message(err, 'Không lưu được giọng')); }
  });
  const suggest = () => run('suggest', async () => {
    try { onChange(await suggestVoices(series.id)); } catch (err) { alert(message(err, 'Claude chưa gợi ý được giọng')); }
  });
  const play = (url: string | null) => { if (url) new Audio(url).play().catch(() => alert('Không phát được giọng mẫu')); };

  return (
    <details className="card" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) load(); }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        Giọng đọc <span className="lg-meta" style={{ fontWeight: 400 }}>{missing ? `${missing}/${who.length} chưa chọn` : 'đã chọn đủ'}</span>
      </summary>
      <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
        <p className="lg-meta" style={{ margin: 0 }}>Mỗi nhân vật một giọng ElevenLabs, cộng giọng người kể. Bấm "Claude gợi ý" để Claude chọn từ các giọng trong tài khoản theo mô tả nhân vật, rồi đổi lại tuỳ ý. Chưa chọn thì dùng giọng trong file env của worker.</p>
        {problem && <p className="lg-error" style={{ margin: 0 }}>{problem}</p>}
        {!voices && !problem && <div className="flex align-center gap-2 lg-meta"><Loader2 size={14} className="spin" /> Đang đọc danh sách giọng…</div>}
        {voices && (
          <div className="an-voices">
            {who.map(({ id, name, hint }) => {
              const current = voices.find((v) => v.id === draft[id]);
              return (
                <div key={id} className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{name} <span className="lg-meta">{hint}</span></label>
                  <div className="flex gap-2">
                    <select className="form-input" value={draft[id] ?? ''} onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}>
                      <option value="">(theo file env)</option>
                      {draft[id] && !current && <option value={draft[id]}>{draft[id]} (không có trong tài khoản)</option>}
                      {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <button className="icon-btn" title="Nghe giọng mẫu" disabled={!current?.preview} onClick={() => play(current?.preview ?? null)}><Play size={14} /></button>
                  </div>
                  {current?.description && <span className="lg-meta">{current.description}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={!!busy || !!problem} onClick={suggest}>{busy === 'suggest' ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Claude gợi ý</button>
          <button className="btn btn-primary btn-sm" disabled={!!busy || !dirty} onClick={save}><Save size={14} /> Lưu giọng</button>
        </div>
      </div>
    </details>
  );
};
