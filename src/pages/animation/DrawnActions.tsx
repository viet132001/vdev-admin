import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import {
  ACTION_PRESET_LABEL, addDrawnAction, fileUrl, removeDrawnAction, setPoseMark,
  type AssetItem, type AssetSeries, type PoseMark
} from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export const AddDrawnAction: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void }> = ({ series, onChange }) => {
  const [character, setCharacter] = useState(series.bible.characters[0]?.id ?? '');
  const [action, setAction] = useState('slash');
  const { busy, run } = useBusy();
  const add = () => run('add', async () => {
    try { onChange(await addDrawnAction(series.id, character, action)); } catch (err) { alert(message(err, 'Không thêm được động tác')); }
  });
  return (
    <div className="card flex flex-col gap-2">
      <strong>Thêm động tác vẽ sẵn (chém, đâm, quăng, kéo)</strong>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 'auto' }} value={character} onChange={(e) => setCharacter(e.target.value)} aria-label="Nhân vật">
          {series.bible.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Động tác">
          {Object.entries(ACTION_PRESET_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button className="btn btn-secondary" disabled={!!busy || !character} onClick={add}><Plus size={16} /> Thêm</button>
      </div>
      <p className="lg-meta" style={{ margin: 0 }}>Thẻ mới nằm ở mục "Động tác vẽ sẵn". Vẽ một tấm các dáng tay không cầm gì, rồi đánh dấu chỗ nắm một lần; đổi vũ khí không phải vẽ lại.</p>
    </div>
  );
};

// One pose at a time: click the fist, turn the weapon, say whether it goes behind the body
export const PoseMarker: React.FC<{ seriesId: string; item: AssetItem; onChange: (series: AssetSeries) => void }> = ({ seriesId, item, onChange }) => {
  const [pose, setPose] = useState(0);
  const { busy, run } = useBusy();
  const part = item.parts[pose];
  const mark = item.marks?.[pose];
  const save = (patch: Partial<PoseMark>) => run('pose', async () => {
    try { onChange(await setPoseMark(seriesId, item.id, pose, patch)); } catch (err) { alert(message(err, 'Không lưu được dáng')); }
  });
  const remove = () => run('remove', async () => {
    try { onChange(await removeDrawnAction(seriesId, item.id)); } catch (err) { alert(message(err, 'Không xoá được')); }
  });
  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    save({ x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) });
  };
  const left = (item.marks ?? []).filter((m) => m.x === null).length;

  return (
    <div className="flex flex-col gap-2">
      {part && mark && (
        <>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {item.parts.map((p, n) => (
              <button key={p.name} className={`btn btn-sm ${pose === n ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPose(n)}>
                Dáng {n + 1}{item.marks?.[n]?.x === null ? ' •' : ''}
              </button>
            ))}
          </div>
          <div className={`an-joint an-checker${busy === 'pose' ? ' busy' : ''}`} onClick={place} title="Bấm vào giữa nắm tay cầm vũ khí" style={{ position: 'relative', alignSelf: 'flex-start' }}>
            <img src={fileUrl(seriesId, part.file)} alt={`Dáng ${pose + 1}`} draggable={false} />
            {mark.x !== null && mark.y !== null && (
              <>
                {/* where the weapon will point */}
                <div style={{ position: 'absolute', left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: 3, height: 70, marginLeft: -1.5, marginTop: -70, background: 'var(--primary)', transformOrigin: '50% 100%', transform: `rotate(${mark.angle}deg)`, pointerEvents: 'none' }} />
                <i className="an-dot" style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }} />
              </>
            )}
          </div>
          <PoseAngle key={`${pose}-${mark.angle}`} angle={mark.angle} onSave={(angle) => save({ angle })} />
          <label className="flex align-center gap-2 lg-meta">
            <input type="checkbox" checked={mark.behind} disabled={!!busy} onChange={(e) => save({ behind: e.target.checked })} /> Vũ khí nằm sau người ở dáng này
          </label>
          <p className="lg-meta" style={{ margin: 0 }}>{left ? `Còn ${left} dáng chưa đánh dấu chỗ nắm tay.` : 'Đã đánh dấu đủ. Xem trong Phòng tập.'} Đoạn thẳng chỉ hướng mũi vũ khí.</p>
        </>
      )}
      <div><button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={remove}><Trash2 size={14} /> Xoá động tác này</button></div>
    </div>
  );
};

const PoseAngle: React.FC<{ angle: number; onSave: (angle: number) => void }> = ({ angle, onSave }) => {
  const [value, setValue] = useState(angle);
  const save = () => { if (value !== angle) onSave(value); };
  return (
    <label className="flex flex-col gap-2 lg-meta">
      Hướng vũ khí: {value}° (0 là chĩa lên, 90 là chĩa ra trước)
      <input type="range" min={-180} max={180} value={value} onChange={(e) => setValue(Number(e.target.value))} onPointerUp={save} onKeyUp={save} />
    </label>
  );
};
