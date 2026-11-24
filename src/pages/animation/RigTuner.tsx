import React, { useState } from 'react';
import { useBusy } from '../tasks/agent';
import {
  DEFAULT_SKELETON, JOINT_INFO, PART_LABEL, fileUrl, setHeadScale, setJoint,
  type AssetItem, type AssetPart, type AssetSeries, type JointName
} from './animationWorker';
import { POSE_NAMES, PREVIEW_POSES, placePieces } from './rigPreview';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const STAGE = { width: 260, height: 340 };

// The character put together from its sheets, in a pose: what the video will show
const RigStage: React.FC<{ seriesId: string; parts: Record<string, AssetPart>; head: AssetPart | undefined; body: AssetItem; headScale: number; pose: string }> = ({ seriesId, parts, head, body, headScale, pose }) => {
  const skeleton = body.skeleton ?? DEFAULT_SKELETON;
  const placed = placePieces(parts, head, skeleton.joints, headScale, PREVIEW_POSES[pose]);
  if (!placed) return <p className="lg-meta" style={{ margin: 0 }}>Cần đủ thân, bắp tay, cẳng tay, đùi, cẳng chân và ảnh đầu bình thường để ráp thử.</p>;
  const k = (STAGE.height - 30) / -placed.top;
  return (
    <div className="an-rig-stage an-checker" style={{ width: STAGE.width, height: STAGE.height }}>
      <div style={{ position: 'absolute', left: STAGE.width / 2, top: STAGE.height - 12 }}>
        {placed.pieces.map((p, i) => {
          const s = p.scale * k;
          return (
            <div key={i} style={{ position: 'absolute', left: p.x * k, top: p.y * k, transformOrigin: '0 0', transform: `rotate(${p.rotate}deg)` }}>
              <img src={fileUrl(seriesId, p.sprite.file)} alt="" draggable={false} style={{
                position: 'absolute', maxWidth: 'none', width: p.sprite.width * s, height: p.sprite.height * s,
                left: -p.sprite.pivot.x * p.sprite.width * s, top: -p.sprite.pivot.y * p.sprite.height * s, filter: p.back ? 'brightness(0.74)' : undefined
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Click a body part where its child joins: the neck, shoulder and hip on the torso, the elbow on the upper arm...
export const RigTuner: React.FC<{ seriesId: string; item: AssetItem; heads: AssetItem | undefined; onChange: (series: AssetSeries) => void }> = ({ seriesId, item, heads, onChange }) => {
  const { busy, run } = useBusy();
  const [joint, setActive] = useState<JointName>('neck');
  const [pose, setPose] = useState('stand');
  const skeleton = item.skeleton ?? DEFAULT_SKELETON;
  const [headScale, setScale] = useState(skeleton.headScale);
  const parts = Object.fromEntries(item.parts.map((part) => [part.name, part]));
  const head = heads?.parts.find((part) => part.name === 'neutral');
  const parent = parts[JOINT_INFO[joint].part];
  const at = skeleton.joints[joint];

  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    run('joint', async () => {
      try { onChange(await setJoint(seriesId, item.id, joint, x, y)); } catch (err) { alert(message(err, 'Không lưu được khớp')); }
    });
  };
  const saveScale = () => run('scale', async () => {
    try { onChange(await setHeadScale(seriesId, item.id, headScale)); } catch (err) { alert(message(err, 'Không lưu được cỡ đầu')); }
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="lg-meta" style={{ margin: 0 }}>
        Ráp thử nhân vật từ các bộ phận. Chọn một khớp rồi bấm vào ảnh bộ phận đó tại điểm khớp. Điểm xoay của từng bộ phận (đầu trên của tay, chân) chỉnh ở danh sách bộ phận bên dưới.
      </p>
      <div className="an-rig">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {Object.entries(POSE_NAMES).map(([id, label]) => (
              <button key={id} className={`btn btn-sm ${pose === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPose(id)}>{label}</button>
            ))}
          </div>
          <RigStage seriesId={seriesId} parts={parts} head={head} body={item} headScale={headScale} pose={pose} />
          <label className="flex flex-col gap-2 lg-meta">
            Cỡ đầu: {Math.round(headScale * 100)}% chiều cao thân
            <input type="range" min={15} max={150} value={Math.round(headScale * 100)} onChange={(e) => setScale(Number(e.target.value) / 100)} onPointerUp={saveScale} onKeyUp={saveScale} />
          </label>
        </div>
        <div className="flex flex-col gap-2" style={{ minWidth: 0 }}>
          <select className="form-input" value={joint} onChange={(e) => setActive(e.target.value as JointName)} aria-label="Khớp">
            {(Object.keys(JOINT_INFO) as JointName[]).map((name) => <option key={name} value={name}>{JOINT_INFO[name].label} ({PART_LABEL[JOINT_INFO[name].part]})</option>)}
          </select>
          {parent ? (
            <div className={`an-joint an-checker${busy === 'joint' ? ' busy' : ''}`} onClick={place} title="Bấm để đặt khớp">
              <img src={fileUrl(seriesId, parent.file)} alt={PART_LABEL[parent.name] ?? parent.name} draggable={false} />
              <i className="an-dot" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }} />
            </div>
          ) : <p className="lg-meta" style={{ margin: 0 }}>Chưa có ảnh {PART_LABEL[JOINT_INFO[joint].part]}.</p>}
        </div>
      </div>
    </div>
  );
};
