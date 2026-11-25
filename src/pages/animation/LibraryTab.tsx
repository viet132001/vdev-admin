import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { WORKER_COMMAND } from '../dictation/lessonWorker';
import { KIND_LABEL, fileUrl, listShared, setAssetMeta, setSize, type SharedAsset } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const tagsOf = (text: string) => text.split(',').map((tag) => tag.trim()).filter(Boolean);

// One asset with its attributes; each field is saved when it is left
const LibraryCard: React.FC<{ asset: SharedAsset; onSaved: () => void; onOpen: () => void }> = ({ asset, onSaved, onOpen }) => {
  const { busy, run } = useBusy();
  const [height, setHeight] = useState(String(asset.heightCm ?? ''));
  const [style, setStyle] = useState(asset.style);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const save = (changed: boolean, action: () => Promise<unknown>) => {
    if (!changed) return;
    run('save', async () => {
      try { await action(); onSaved(); } catch (err) { alert(message(err, 'Không lưu được')); }
    });
  };
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  return (
    <div className="card an-card">
      <div className="an-thumb an-checker"><img src={fileUrl(asset.series, asset.file)} alt={asset.name} /></div>
      <div className="an-body">
        <strong className="vl-title">{asset.name}</strong>
        <p className="lg-meta" style={{ margin: 0 }}>{KIND_LABEL[asset.kind]}{asset.usedBy ? ` · ${asset.usedBy} series khác đang dùng` : ''}</p>
        {asset.kind !== 'background' && (
          <label className="flex align-center gap-2 lg-meta">Cao thật
            <input className="form-input" style={{ width: 90 }} type="number" min={1} max={3000} value={height} disabled={!!busy} placeholder="chưa đặt" onKeyDown={onEnter}
              onChange={(e) => setHeight(e.target.value)} onBlur={() => { const value = height.trim() ? Number(height) : null; save(value !== asset.heightCm, () => setSize(asset.series, asset.item, value)); }} />
            cm
          </label>
        )}
        <label className="form-label">Phong cách
          <input className="form-input" maxLength={40} value={style} disabled={!!busy} onKeyDown={onEnter} onChange={(e) => setStyle(e.target.value)}
            onBlur={() => save(style.trim() !== asset.style, () => setAssetMeta(asset.series, asset.item, { style }))} />
        </label>
        <label className="form-label">Nhãn (cách nhau bằng dấu phẩy)
          <input className="form-input" value={tags} disabled={!!busy} placeholder="ban đêm, sông nước" onKeyDown={onEnter} onChange={(e) => setTags(e.target.value)}
            onBlur={() => save(tagsOf(tags).join(',').toLowerCase() !== asset.tags.join(','), () => setAssetMeta(asset.series, asset.item, { tags: tagsOf(tags) }))} />
        </label>
        <div><button className="btn btn-ghost btn-sm" onClick={onOpen}>Mở series "{asset.seriesTitle}"</button></div>
      </div>
    </div>
  );
};

// Every background, prop and plant of every series, with what decides where it can be reused
export const LibraryTab: React.FC = () => {
  const [, setParams] = useSearchParams();
  const [all, setAll] = useState<SharedAsset[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [kind, setKind] = useState('');
  const [style, setStyle] = useState('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    listShared().then((next) => { setAll(next); setOffline(false); }).catch(() => setOffline(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (offline) {
    return (
      <div className="card flex flex-col gap-3">
        <p>Không đọc được kho từ worker trên máy. Chạy lệnh sau một lần rồi thử lại:</p>
        <pre className="lg-command">{WORKER_COMMAND}</pre>
        <div><button className="btn btn-primary" onClick={load}><RotateCcw size={16} /> Thử lại</button></div>
      </div>
    );
  }
  if (!all) return <div className="loading-container"><div className="spinner" /></div>;
  if (!all.length) return <div className="card"><p className="lg-meta" style={{ margin: 0 }}>Kho đang trống. Bối cảnh, đạo cụ và cây cỏ sẽ hiện ở đây ngay khi series có ảnh của chúng.</p></div>;

  const needle = search.trim().toLowerCase();
  const shown = all.filter((a) => (!kind || a.kind === kind) && (!style || a.style === style) && (!tag || a.tags.includes(tag))
    && (!needle || `${a.name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(needle)));
  const styles = [...new Set(all.map((a) => a.style))];
  const tags = [...new Set(all.flatMap((a) => a.tags))].sort();

  return (
    <div className="flex flex-col gap-3">
      <p className="lg-meta" style={{ margin: 0 }}>Ảnh vẽ một lần, series nào cũng dùng được. Sửa chiều cao, phong cách hay nhãn ở đây thì các series đang dùng cũng đổi theo.</p>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 160 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mô tả, nhãn" />
        <select className="form-input" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại">
          <option value="">Mọi loại</option>
          {(['background', 'prop', 'plant'] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Phong cách">
          <option value="">Mọi phong cách</option>
          {styles.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {tags.length > 0 && (
          <select className="form-input" style={{ width: 'auto' }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Nhãn">
            <option value="">Mọi nhãn</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>
      {!shown.length && <p className="lg-meta" style={{ margin: 0 }}>Không có asset nào khớp bộ lọc.</p>}
      <div className="an-grid">
        {shown.map((a) => (
          // key on the saved values: a card restarts from them after a reload
          <LibraryCard key={`${a.series}/${a.item}/${a.heightCm}/${a.style}/${a.tags.join()}`} asset={a} onSaved={load} onOpen={() => setParams({ series: a.series })} />
        ))}
      </div>
    </div>
  );
};
