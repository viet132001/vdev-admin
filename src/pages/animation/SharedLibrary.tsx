import React, { useEffect, useState } from 'react';
import { Library, Loader2, Plus } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { KIND_LABEL, LIBRARY_KINDS, borrowAsset, fileUrl, listShared, type AssetSeries, type SharedAsset } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const Grid: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void }> = ({ series, onChange }) => {
  const [all, setAll] = useState<SharedAsset[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('');
  const [style, setStyle] = useState('');
  const [search, setSearch] = useState('');
  const { busy, run } = useBusy();

  useEffect(() => {
    listShared().then(setAll).catch((err) => setError(message(err, 'Không đọc được kho')));
  }, [series.id]);

  if (error) return <p className="lg-meta">{error}</p>;
  if (!all) return <Loader2 size={18} className="spin" />;

  const others = all.filter((a) => a.series !== series.id);
  if (!others.length) return <p className="lg-meta">Chưa series nào khác có ảnh để lấy.</p>;
  const needle = search.trim().toLowerCase();
  const shown = others.filter((a) => (!kind || a.kind === kind) && (!style || a.style === style) && (!needle || `${a.name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(needle)));
  const taken = (a: SharedAsset) => series.items.some((item) => item.from?.series === a.series && item.from.item === a.item);
  const take = (a: SharedAsset) => run(`${a.series}/${a.item}`, async () => {
    try { onChange(await borrowAsset(series.id, a.series, a.item)); } catch (err) { alert(message(err, 'Không lấy được asset')); }
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 160 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mô tả" />
        <select className="form-input" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại">
          <option value="">Mọi loại</option>
          {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Phong cách">
          <option value="">Mọi phong cách</option>
          {[...new Set(others.map((a) => a.style))].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {!shown.length && <p className="lg-meta" style={{ margin: 0 }}>Không có asset nào khớp bộ lọc.</p>}
      <div className="an-grid">
        {shown.map((a) => (
          <div key={`${a.series}/${a.item}`} className="card an-card">
            <div className="an-thumb an-checker"><img src={fileUrl(a.series, a.file)} alt={a.name} /></div>
            <div className="an-body">
              <strong className="vl-title">{a.name}</strong>
              <p className="lg-meta" style={{ margin: 0 }}>{KIND_LABEL[a.kind]} · {a.style}{a.heightCm ? ` · cao ${a.heightCm} cm` : ''}{a.tags.length ? ` · ${a.tags.join(', ')}` : ''}</p>
              <p className="lg-meta" style={{ margin: 0 }}>Từ series "{a.seriesTitle}"</p>
              <div>
                <button className="btn btn-secondary btn-sm" disabled={!!busy || taken(a)} onClick={() => take(a)}>
                  {busy === `${a.series}/${a.item}` ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} {taken(a) ? 'Đã lấy' : 'Dùng cho series này'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Reuse what other series already have; read only when opened
export const SharedLibrary: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void }> = ({ series, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <details className="card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}><Library size={14} /> Lấy từ kho dùng chung (nhân vật, bối cảnh, đạo cụ, con vật, cây cỏ của series khác)</summary>
      <div style={{ marginTop: 12 }}>{open && <Grid series={series} onChange={onChange} />}</div>
    </details>
  );
};
