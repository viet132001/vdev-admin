import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquareText, Play, Save, Sparkles } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { NARRATOR, listVoices, sampleVoice, setVoices, suggestVoices, type AssetSeries, type VoiceInfo } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// One ElevenLabs voice per character and one for the narrator. Claude can suggest them from the account's voices;
// the choice is saved on the series and every video of it uses it.
// only: the people to show (the narrator and whoever speaks in a script); lines: a line of each, to hear it in the voice
export const VoicePanel: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void; only?: string[]; lines?: Record<string, string>; startOpen?: boolean }> = ({ series, onChange, only, lines, startOpen }) => {
  const { busy, run } = useBusy();
  const [hearing, setHearing] = useState<string | null>(null);
  const [voices, setList] = useState<VoiceInfo[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(series.voices ?? {});
  useEffect(() => { setDraft(series.voices ?? {}); }, [series.voices]);
  useEffect(() => { if (startOpen) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startOpen]);

  const load = () => {
    if (voices) return;
    listVoices().then(setList).catch((err) => setProblem(message(err, 'Không đọc được danh sách giọng ElevenLabs')));
  };
  const everyone = [{ id: NARRATOR, name: 'Người kể chuyện', hint: 'Đọc phần dẫn truyện' }, ...series.bible.characters.map((c) => ({ id: c.id, name: c.name, hint: c.voice }))];
  const who = only ? everyone.filter(({ id }) => only.includes(id)) : everyone;
  const dirty = who.some(({ id }) => (draft[id] ?? '') !== (series.voices?.[id] ?? ''));
  const missing = who.filter(({ id }) => !series.voices?.[id]).length;

  const save = () => run('save', async () => {
    try { onChange(await setVoices(series.id, Object.fromEntries(who.map(({ id }) => [id, draft[id] ?? ''])))); } catch (err) { alert(message(err, 'Không lưu được giọng')); }
  });
  const suggest = () => run('suggest', async () => {
    try { onChange(await suggestVoices(series.id)); } catch (err) { alert(message(err, 'Claude chưa gợi ý được giọng')); }
  });
  const play = (url: string | null) => { if (url) new Audio(url).play().catch(() => alert('Không phát được giọng mẫu')); };
  // Reads the person's own line in the chosen voice: costs a few ElevenLabs characters the first time, then it is cached
  const hear = async (id: string) => {
    const voice = draft[id], text = lines?.[id];
    if (!voice || !text) return;
    setHearing(id);
    try { play(await sampleVoice(voice, text)); } catch (err) { alert(message(err, 'Không đọc thử được')); } finally { setHearing(null); }
  };

  return (
    <details className="card" open={startOpen} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) load(); }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        Giọng đọc <span className="lg-meta" style={{ fontWeight: 400 }}>{missing ? `${missing}/${who.length} chưa chọn` : 'đã chọn đủ'}</span>
      </summary>
      <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
        <p className="lg-meta" style={{ margin: 0 }}>{lines ? 'Nút ▶ phát giọng mẫu của ElevenLabs (miễn phí); nút bên cạnh đọc câu đầu tiên của người đó trong kịch bản bằng giọng đang chọn (tốn vài chục ký tự credit lần đầu, nghe lại không tốn). ' : ''}Mỗi nhân vật một giọng ElevenLabs, cộng giọng người kể. Bấm "Claude gợi ý" để Claude chọn từ các giọng trong tài khoản theo mô tả nhân vật, rồi đổi lại tuỳ ý. Chưa chọn thì dùng giọng trong file env của worker.</p>
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
                    <button className="icon-btn" title="Nghe giọng mẫu của ElevenLabs (miễn phí)" disabled={!current?.preview} onClick={() => play(current?.preview ?? null)}><Play size={14} /></button>
                    {lines?.[id] && (
                      <button className="icon-btn" title={`Nghe giọng này đọc: "${lines[id]}"`} disabled={!draft[id] || hearing !== null} onClick={() => hear(id)}>
                        {hearing === id ? <Loader2 size={14} className="spin" /> : <MessageSquareText size={14} />}
                      </button>
                    )}
                  </div>
                  {lines?.[id] && <span className="lg-meta">Câu thử: "{lines[id].length > 70 ? `${lines[id].slice(0, 70)}…` : lines[id]}"</span>}
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
