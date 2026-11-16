import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { DEFAULT_RIG, DEFAULT_TOLERANCE, PART_LABEL, fileUrl, reprocessAsset, setAssetPivot, setMouthRig, type AssetItem, type AssetPart, type AssetSeries } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// Click the picture where the part should turn / stand: feet of a character, centre of a mouth
const PivotPicker: React.FC<{ seriesId: string; item: AssetItem; part: AssetPart; onChange: (series: AssetSeries) => void }> = ({ seriesId, item, part, onChange }) => {
  const { busy, run } = useBusy();
  const set = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    run('pivot', async () => {
      try { onChange(await setAssetPivot(seriesId, item.id, part.name, x, y)); } catch (err) { alert(message(err, 'Không lưu được pivot')); }
    });
  };
  return (
    <figure className="an-part">
      <div className={`an-pivot an-checker${busy ? ' busy' : ''}`} onClick={set} title="Bấm để đặt pivot">
        <img src={fileUrl(seriesId, part.file)} alt={PART_LABEL[part.name] ?? part.name} draggable={false} />
        <i className="an-dot" style={{ left: `${part.pivot.x * 100}%`, top: `${part.pivot.y * 100}%` }} />
      </div>
      <figcaption className="lg-meta">{PART_LABEL[part.name] ?? part.name} · {part.width}×{part.height}</figcaption>
    </figure>
  );
};

// Where the mouth goes on the character: click the face, size with the slider. The engine puts the mouth pictures there while the character talks.
const MouthRigger: React.FC<{ seriesId: string; item: AssetItem; character: AssetItem; onChange: (series: AssetSeries) => void }> = ({ seriesId, item, character, onChange }) => {
  const { busy, run } = useBusy();
  const rig = item.rig ?? DEFAULT_RIG;
  const [scale, setScale] = useState(rig.scale);
  const body = character.parts[0];
  const sample = item.parts.find((part) => part.name === 'wide') ?? item.parts[0];
  if (!body || !sample) return <p className="lg-meta" style={{ margin: 0 }}>Cần ảnh nhân vật "{character.name}" đã tách nền để đặt miệng.</p>;
  const save = (x: number, y: number, s: number) => run('rig', async () => {
    try { onChange(await setMouthRig(seriesId, item.id, x, y, s)); } catch (err) { alert(message(err, 'Không lưu được vị trí miệng')); }
  });
  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    save(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)), scale);
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="lg-meta" style={{ margin: 0 }}>Bấm vào mặt nhân vật để đặt miệng, kéo thanh để chỉnh cỡ (theo bề ngang nhân vật).</p>
      <div className={`an-pivot an-checker${busy ? ' busy' : ''}`} onClick={place} style={{ alignSelf: 'flex-start' }}>
        <img src={fileUrl(seriesId, body.file)} alt={character.name} draggable={false} />
        <img src={fileUrl(seriesId, sample.file)} alt="" draggable={false} className="an-mouth-preview" style={{ left: `${rig.x * 100}%`, top: `${rig.y * 100}%`, width: `${scale * 100}%` }} />
      </div>
      <label className="flex flex-col gap-2 lg-meta">
        Cỡ miệng: {Math.round(scale * 100)}%
        <input type="range" min={3} max={60} value={Math.round(scale * 100)} onChange={(e) => setScale(Number(e.target.value) / 100)}
          onPointerUp={() => save(rig.x, rig.y, scale)} onKeyUp={() => save(rig.x, rig.y, scale)} />
      </label>
    </div>
  );
};

export const AssetTuner: React.FC<{ seriesId: string; item: AssetItem; character?: AssetItem; onChange: (series: AssetSeries) => void }> = ({ seriesId, item, character, onChange }) => {
  const [tolerance, setTolerance] = useState(item.tolerance ?? DEFAULT_TOLERANCE);
  const { busy, run } = useBusy();
  if (!item.file || item.kind === 'background') return null;

  const apply = () => run('process', async () => {
    try { onChange(await reprocessAsset(seriesId, item.id, tolerance)); } catch (err) { alert(message(err, 'Không tách lại được')); }
  });

  return (
    <details open={!!item.problem}>
      <summary className="lg-meta" style={{ cursor: 'pointer' }}>Tách nền và pivot</summary>
      <div className="flex flex-col gap-3" style={{ marginTop: 8 }}>
        {item.problem && <p className="lg-error" style={{ margin: 0 }}>{item.problem}</p>}
        <label className="flex flex-col gap-2 lg-meta">
          Độ nhạy tách nền: {tolerance} <span>(cao hơn = xoá thêm vùng gần màu nền; thấp hơn = giữ thêm viền)</span>
          <input type="range" min={10} max={200} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
        </label>
        <div><button className="btn btn-secondary btn-sm" disabled={!!busy || tolerance === (item.tolerance ?? DEFAULT_TOLERANCE) && !item.problem} onClick={apply}><RefreshCw size={14} className={busy === 'process' ? 'spin' : ''} /> Tách lại</button></div>
        {item.kind === 'mouths' && character && item.parts.length > 0 && <MouthRigger seriesId={seriesId} item={item} character={character} onChange={onChange} />}
        {item.parts.length > 0 && (
          <>
            <p className="lg-meta" style={{ margin: 0 }}>Chấm tròn là pivot: nơi bộ phận đứng hoặc xoay. Nhân vật mặc định ở chân, miệng và đạo cụ ở giữa. Bấm vào ảnh để dời.</p>
            <div className="an-parts">
              {item.parts.map((part) => <PivotPicker key={part.file} seriesId={seriesId} item={item} part={part} onChange={onChange} />)}
            </div>
          </>
        )}
      </div>
    </details>
  );
};
