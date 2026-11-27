import React, { useState } from 'react';
import { useBusy } from '../tasks/agent';
import { SPOT_LABEL, ZONE_LABEL, assetUrl, setSceneMap, type AssetItem, type AssetSeries, type SceneMap, type SpotKind, type ZoneKind } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const ZONE_COLOR: Record<ZoneKind, string> = { ground: '#16a34a', water: '#2563eb', house: '#d97706', block: '#dc2626' };
// Where feet stand when a shot says nothing: GROUND_LINE of the stage, on a 16:9 picture grown by the overscan
const FEET_LINE = (930 / 1080 + 0.04) / 1.08;
const EMPTY: SceneMap = { zones: [], spots: [] };

// Marks on a background where the ground, water, houses and seats are. Saved when asked, not on every click.
export const SceneMapEditor: React.FC<{ seriesId: string; item: AssetItem; onChange: (series: AssetSeries) => void }> = ({ seriesId, item, onChange }) => {
  const { busy, run } = useBusy();
  const [map, setMap] = useState<SceneMap>(item.map ?? EMPTY);
  const [tool, setTool] = useState<ZoneKind | SpotKind>('ground');
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [dirty, setDirty] = useState(false);
  const [seatTop, setSeatTop] = useState<[number, number] | null>(null); // a seat waits for the floor before it
  const url = assetUrl(seriesId, item);
  if (!url) return null;

  const isZone = tool in ZONE_LABEL;
  const change = (next: SceneMap) => { setMap(next); setDirty(true); };
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    if (busy) return;
    const box = e.currentTarget.getBoundingClientRect();
    const point: [number, number] = [Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (e.clientY - box.top) / box.height))];
    if (isZone) setDraft([...draft, point]);
    else if (tool === 'seat' && !seatTop) setSeatTop(point);
    else if (tool === 'seat' && seatTop) {
      change({ ...map, spots: [...map.spots, { kind: 'seat', x: seatTop[0], y: seatTop[1], floor: Math.max(seatTop[1], point[1]) }] });
      setSeatTop(null);
    } else change({ ...map, spots: [...map.spots, { kind: tool as SpotKind, x: point[0], y: point[1] }] });
  };
  const closeZone = () => {
    change({ ...map, zones: [...map.zones, { kind: tool as ZoneKind, points: draft }] });
    setDraft([]);
  };
  const save = () => run('map', async () => {
    try {
      onChange(await setSceneMap(seriesId, item.id, map.zones.length || map.spots.length ? map : null));
      setDirty(false);
    } catch (err) {
      alert(message(err, 'Không lưu được bản đồ'));
    }
  });
  const count = map.zones.length + map.spots.length;

  return (
    <details>
      <summary className="lg-meta" style={{ cursor: 'pointer' }}>Bản đồ cảnh: đất, nước, nhà, chỗ ngồi{count ? ` (${count} mục)` : ' (chưa đánh dấu)'}</summary>
      <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
        <div style={{ position: 'relative', cursor: 'crosshair' }} onClick={click}>
          <img src={url} alt={item.name} style={{ display: 'block', width: '100%', borderRadius: 'var(--radius-sm)' }} />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {map.zones.map((zone, i) => (
              <polygon key={i} points={zone.points.join(' ')} fill={ZONE_COLOR[zone.kind]} fillOpacity={0.3} stroke={ZONE_COLOR[zone.kind]} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
            {draft.length > 0 && <polyline points={[...draft, draft[0]].join(' ')} fill="none" stroke={ZONE_COLOR[tool as ZoneKind]} strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
            <line x1={0} x2={1} y1={FEET_LINE} y2={FEET_LINE} stroke="#fff" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          </svg>
          {draft.map((p, i) => <span key={`d${i}`} style={{ position: 'absolute', left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, width: 8, height: 8, margin: -4, borderRadius: '50%', background: 'var(--primary)' }} />)}
          {map.spots.filter((spot) => spot.floor !== undefined).map((spot, i) => (
            <span key={`f${i}`} style={{ position: 'absolute', left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, height: `${(spot.floor! - spot.y) * 100}%`, borderLeft: '2px dashed #fff', pointerEvents: 'none' }} />
          ))}
          {seatTop && <span className="badge badge-warning" style={{ position: 'absolute', left: `${seatTop[0] * 100}%`, top: `${seatTop[1] * 100}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>Mặt ghế</span>}
          {map.spots.map((spot, i) => (
            <span key={i} className="badge badge-info" style={{ position: 'absolute', left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>{SPOT_LABEL[spot.kind]}</span>
          ))}
        </div>
        <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 'auto' }} value={tool} disabled={!!busy} aria-label="Đang đánh dấu" onChange={(e) => { setTool(e.target.value as ZoneKind | SpotKind); setDraft([]); setSeatTop(null); }}>
            <optgroup label="Vùng">{Object.entries(ZONE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>
            <optgroup label="Điểm">{Object.entries(SPOT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>
          </select>
          {isZone && <button className="btn btn-secondary btn-sm" disabled={!!busy || draft.length < 3} onClick={closeZone}>Xong vùng ({draft.length} điểm)</button>}
          {draft.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setDraft(draft.slice(0, -1))}>Bỏ điểm cuối</button>}
          <button className="btn btn-primary btn-sm" disabled={!!busy || !dirty || draft.length > 0 || !!seatTop} onClick={save}>Lưu bản đồ</button>
        </div>
        {count > 0 && (
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {map.zones.map((zone, i) => (
              <button key={`z${i}`} className="btn btn-ghost btn-sm" disabled={!!busy} title="Xoá vùng này" onClick={() => change({ ...map, zones: map.zones.filter((_, n) => n !== i) })}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ZONE_COLOR[zone.kind], display: 'inline-block' }} /> {ZONE_LABEL[zone.kind]} {i + 1} ×
              </button>
            ))}
            {map.spots.map((spot, i) => (
              <button key={`s${i}`} className="btn btn-ghost btn-sm" disabled={!!busy} title="Xoá điểm này" onClick={() => change({ ...map, spots: map.spots.filter((_, n) => n !== i) })}>{SPOT_LABEL[spot.kind]} ×</button>
            ))}
          </div>
        )}
        <p className="lg-meta" style={{ margin: 0 }}>Bấm lên ảnh để chấm các góc của một vùng rồi bấm Xong vùng. Chỗ ngồi: bấm mặt ghế, rồi bấm sàn ngay trước ghế (chỗ đặt chân); nhân vật ngồi được dịch tới đó, chân tự co duỗi theo độ cao ghế.{seatTop ? ' Giờ bấm sàn trước ghế.' : ''} Vạch trắng là chỗ đặt chân mặc định. Vùng vẽ sau đè lên vùng vẽ trước (cầu gỗ vẽ sau mặt nước); nhà và vật cản luôn không đứng được. Claude viết kịch bản theo bản đồ này.</p>
      </div>
    </details>
  );
};
