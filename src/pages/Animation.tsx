import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Loader2, Plus, Ruler, Trash2 } from 'lucide-react';
import { ConfirmDialog, type ConfirmState } from './tasks/shared';
import { useBusy } from './tasks/agent';
import { WORKER_COMMAND } from './dictation/lessonWorker';
import { AssetBoard } from './animation/AssetBoard';
import { Videos } from './animation/Videos';
import { VoicePanel } from './animation/VoicePanel';
import { BriefDialog } from './animation/BriefDialog';
import { SharedLibrary } from './animation/SharedLibrary';
import { LibraryTab } from './animation/LibraryTab';
import { SIZED_KINDS, addAsset, createAssetSeries, deleteAssetSeries, getAssetSeries, listAssetSeries, setStyleTag, suggestSizes, type AssetSeries, type AssetSummary } from './animation/animationWorker';

const WATCH_EVERY = 6000;
const WATCH_FOR = 45 * 60 * 1000;
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const NewSeries: React.FC<{ onCreated: (series: AssetSeries) => void }> = ({ onCreated }) => {
  const [premise, setPremise] = useState('');
  const [note, setNote] = useState('');
  const [reuse, setReuse] = useState(true);
  const { busy, run } = useBusy();
  const create = () => run('create', async () => {
    try {
      onCreated(await createAssetSeries(premise, note, reuse));
    } catch (err) {
      alert(message(err, 'Không tạo được series'));
    }
  });
  return (
    <div className="card flex flex-col gap-3">
      <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Series mới</h2>
      <p className="lg-meta" style={{ margin: 0 }}>Mô tả ý tưởng, Claude sẽ chốt phong cách hình ảnh, nhân vật, bối cảnh và viết sẵn prompt cho ChatGPT từng ảnh. Ảnh chỉ cần làm một lần, dùng lại cho nhiều video.</p>
      <div className="form-group">
        <label className="form-label">Ý tưởng series <span className="form-required">*</span></label>
        <textarea className="form-input" rows={3} value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="Ví dụ: Cậu bé Bo và những sinh vật nhỏ trong khu rừng giấy, phong cách đồ chơi nỉ và giấy cắt" />
      </div>
      <div className="form-group">
        <label className="form-label">Ghi chú thêm</label>
        <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Màu sắc, tông, nhân vật bắt buộc có…" />
      </div>
      <label className="flex align-center gap-2 lg-meta">
        <input type="checkbox" checked={reuse} disabled={!!busy} onChange={(e) => setReuse(e.target.checked)} /> Dùng lại bối cảnh, đạo cụ, cây cỏ trong kho nếu hợp, chỉ vẽ phần còn thiếu
      </label>
      <div><button className="btn btn-primary" disabled={!!busy || !premise.trim()} onClick={create}>{busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} {busy ? 'Claude đang thiết kế…' : 'Tạo series'}</button></div>
    </div>
  );
};

const AddAsset: React.FC<{ seriesId: string; onChange: (series: AssetSeries) => void }> = ({ seriesId, onChange }) => {
  const [kind, setKind] = useState<'background' | 'prop' | 'plant'>('background');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { busy, run } = useBusy();
  const add = () => run('add', async () => {
    try {
      onChange(await addAsset(seriesId, kind, name, description));
      setName('');
      setDescription('');
    } catch (err) {
      alert(message(err, 'Không thêm được asset'));
    }
  });
  return (
    <details className="card">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Thêm bối cảnh / đạo cụ / cây cỏ</summary>
      <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
        <select className="form-input" value={kind} onChange={(e) => setKind(e.target.value as 'background' | 'prop' | 'plant')}>
          <option value="background">Bối cảnh</option>
          <option value="prop">Đạo cụ</option>
          <option value="plant">Cây cỏ chuyển động (bụi lau, khóm tre... lay theo gió)</option>
        </select>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên (tiếng Việt)" />
        <textarea className="form-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả bằng tiếng Anh để ChatGPT vẽ" />
        <div><button className="btn btn-secondary" disabled={!!busy || !name.trim() || !description.trim()} onClick={add}><Plus size={16} /> Thêm</button></div>
      </div>
    </details>
  );
};

// The name the series' pictures go by in the library; series made before it have none
const StyleTag: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void }> = ({ series, onChange }) => {
  const [text, setText] = useState(series.bible.styleTag ?? '');
  const { busy, run } = useBusy();
  const save = () => {
    if (text.trim() === (series.bible.styleTag ?? '')) return;
    run('style', async () => {
      try { onChange(await setStyleTag(series.id, text)); } catch (err) { alert(message(err, 'Không lưu được tên phong cách')); }
    });
  };
  return (
    <label className="flex align-center gap-2 lg-meta">Tên phong cách
      <input className="form-input" style={{ maxWidth: 240 }} maxLength={40} value={text} disabled={!!busy} placeholder="ví dụ: tranh thuỷ mặc"
        onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
    </label>
  );
};

// Series made before real sizes (or assets added by hand) have none yet
const SuggestSizes: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void }> = ({ series, onChange }) => {
  const { busy, run } = useBusy();
  const missing = series.items.filter((item) => SIZED_KINDS.includes(item.kind) && item.heightCm === null).length;
  if (!missing) return null;
  const suggest = () => run('sizes', async () => {
    try { onChange(await suggestSizes(series.id)); } catch (err) { alert(message(err, 'Không ước lượng được kích thước')); }
  });
  return (
    <div className="card flex align-center gap-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <p className="lg-meta" style={{ margin: 0 }}>{missing} asset chưa có chiều cao thật nên đang được vẽ theo cỡ cố định, dễ lệch tỉ lệ với nhân vật.</p>
      <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={suggest}>{busy ? <Loader2 size={14} className="spin" /> : <Ruler size={14} />} {busy ? 'Claude đang ước lượng…' : 'Claude ước lượng kích thước'}</button>
    </div>
  );
};

export const Animation: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const seriesId = params.get('series');
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [list, setList] = useState<AssetSummary[]>([]);
  const [series, setSeries] = useState<AssetSeries | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  // While Claude Desktop is drawing, the pictures arrive through the worker: re-read the series until then
  const [watchUntil, setWatchUntil] = useState(0);
  const [brief, setBrief] = useState<string[] | null>(null); // the items to hand over; [] = everything missing

  const load = useCallback(async () => {
    try {
      setList(await listAssetSeries());
      setState('online');
    } catch {
      setState('offline');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeId = seriesId ?? list[0]?.id ?? null;
  const openTab = params.get('tab');
  useEffect(() => {
    if (!activeId || activeId === 'new') { setSeries(null); return; }
    getAssetSeries(activeId).then(setSeries).catch(() => setSeries(null));
  }, [activeId, openTab]);

  useEffect(() => {
    if (!series || Date.now() > watchUntil) return;
    const timer = window.setInterval(() => {
      if (Date.now() > watchUntil) { window.clearInterval(timer); return; }
      if (!document.hidden) getAssetSeries(series.id).then(changed).catch(() => undefined);
    }, WATCH_EVERY);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.id, watchUntil]);
  const handed = () => setWatchUntil(Date.now() + WATCH_FOR);

  const open = (id: string) => setParams(id === 'new' ? { series: 'new' } : { series: id });
  const changed = (next: AssetSeries) => {
    setSeries(next);
    setList((all) => (all.some((s) => s.id === next.id) ? all : [{ id: next.id, title: next.title, premise: next.premise, ready: 0, total: next.items.length, createdAt: next.createdAt }, ...all]).map((s) => (s.id === next.id ? { ...s, ready: next.items.filter((i) => i.file).length, total: next.items.length } : s)));
  };

  const tab = params.get('tab') === 'video' ? 'video' : params.get('tab') === 'library' ? 'library' : 'assets';
  const header = (
    <div className="flex flex-col gap-3">
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>Xưởng hoạt hình</h1>
        <p className="lg-meta" style={{ margin: 0 }}>ChatGPT vẽ asset một lần, engine dựng chuyển động, biểu cảm và camera thành video.</p>
      </div>
      <div className="tabs">
        <button className={`tab${tab === 'assets' ? ' active' : ''}`} onClick={() => setParams({})}>Asset</button>
        <button className={`tab${tab === 'video' ? ' active' : ''}`} onClick={() => setParams({ tab: 'video' })}>Video</button>
        <button className={`tab${tab === 'library' ? ' active' : ''}`} onClick={() => setParams({ tab: 'library' })}>Kho asset</button>
      </div>
    </div>
  );
  if (tab === 'video') return <div className="flex flex-col gap-4">{header}<Videos /></div>;
  if (tab === 'library') return <div className="flex flex-col gap-4">{header}<LibraryTab /></div>;

  if (state === 'loading') return <div className="loading-container"><div className="spinner" /></div>;
  if (state === 'offline') {
    return (
      <div className="card flex flex-col gap-3">
        <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>Xưởng hoạt hình</h1>
        <p>Không kết nối được worker trên máy. Chạy lệnh sau một lần rồi thử lại:</p>
        <pre className="lg-command">{WORKER_COMMAND}</pre>
        <div><button className="btn btn-primary" onClick={() => { setState('loading'); load(); }}>Thử lại</button></div>
      </div>
    );
  }

  const ready = series ? series.items.filter((i) => i.file).length : 0;
  return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="an-shell">
        <div className="st-list">
          <button className={`st-item ${activeId === 'new' ? 'active' : ''}`} onClick={() => open('new')}><span className="flex align-center gap-2"><Plus size={14} /> Series mới</span></button>
          {list.map((s) => (
            <button key={s.id} className={`st-item ${activeId === s.id ? 'active' : ''}`} onClick={() => open(s.id)}>
              <span className="vl-title">{s.title}</span>
              <span className="lg-meta">{s.ready}/{s.total} ảnh</span>
            </button>
          ))}
        </div>
        <div className="st-main flex flex-col gap-4">
          {(activeId === 'new' || !series) && <NewSeries onCreated={(next) => { changed(next); open(next.id); }} />}
          {activeId !== 'new' && series && (
            <>
              <div className="card flex flex-col gap-3">
                <div className="flex align-center gap-3" style={{ justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>{series.title}</h2>
                    <p className="lg-meta" style={{ margin: 0 }}>{series.premise}</p>
                  </div>
                  <div className="flex align-center gap-2">
                    <span className={`badge ${ready === series.items.length ? 'badge-success' : 'badge-info'}`}>{ready}/{series.items.length} ảnh</span>
                    {ready < series.items.length && (
                      <button className="btn btn-primary btn-sm" title="Giao Claude Code Desktop vẽ mọi ảnh còn thiếu" onClick={() => setBrief([])}>
                        <Bot size={14} /> Giao Claude vẽ phần còn thiếu
                      </button>
                    )}
                    <button className="icon-btn" title="Xoá series" onClick={() => setConfirm({ title: 'Xoá series', message: `Xoá "${series.title}" cùng toàn bộ ảnh đã tải lên?`, confirmLabel: 'Xoá', action: async () => { setConfirm(null); try { await deleteAssetSeries(series.id); setSeries(null); setList((all) => all.filter((s) => s.id !== series.id)); setParams({}); } catch (err) { alert(message(err, 'Không xoá được series')); } } })}><Trash2 size={16} /></button>
                  </div>
                </div>
                <StyleTag key={series.id} series={series} onChange={changed} />
                <details>
                  <summary className="lg-meta" style={{ cursor: 'pointer' }}>Phong cách và nhân vật</summary>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{series.bible.style}</p>
                  <div className="an-bible">
                    {series.bible.characters.map((c) => (
                      <div key={c.id} className="card" style={{ padding: 10 }}>
                        <strong>{c.name}</strong> <span className="lg-meta">{c.role}</span>
                        <p className="lg-meta" style={{ margin: '4px 0 0' }}>Giọng: {c.voice}</p>
                      </div>
                    ))}
                  </div>
                </details>
                <p className="lg-meta" style={{ margin: 0 }}>Làm theo thứ tự: ảnh toàn thân nhân vật trước, rồi bảng bộ phận, bảng đầu và hình miệng (đính kèm ảnh toàn thân khi nhờ ChatGPT); bối cảnh rồi tiền cảnh của nó (đính kèm ảnh bối cảnh); đạo cụ. Có bảng bộ phận và bảng đầu thì nhân vật cử động được tay chân, quỳ, ngồi, đi, cầm đồ; ráp khớp ở thẻ bộ phận. Mỗi thẻ: chép prompt sang ChatGPT, vẽ xong thì dán ảnh (Ctrl+V), kéo thả hoặc bấm vào khung.</p>
              </div>
              <VoicePanel series={series} onChange={changed} />
              {Date.now() < watchUntil && <p className="lg-meta" style={{ margin: 0 }}>Đang chờ Claude đưa ảnh vào, trang tự cập nhật.</p>}
              <SuggestSizes series={series} onChange={changed} />
              <SharedLibrary key={series.id} series={series} onChange={changed} />
              <AssetBoard series={series} onChange={changed} onBrief={setBrief} />
              <BriefDialog seriesId={series.id} items={brief} onClose={() => setBrief(null)} onHanded={handed} />
              <AddAsset seriesId={series.id} onChange={changed} />
            </>
          )}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
