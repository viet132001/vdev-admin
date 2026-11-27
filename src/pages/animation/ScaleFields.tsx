import React, { useState } from 'react';
import { useBusy } from '../tasks/agent';
import { SceneMapEditor } from './SceneMapEditor';
import { DEFAULT_HORIZON, HOLD_LABEL, SIZED_KINDS, assetUrl, setDeck, setHoldStyle, setHorizon, setSize, type AssetItem, type AssetSeries, type HoldStyle } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

interface Props { seriesId: string; item: AssetItem; onChange: (series: AssetSeries) => void }

const SizeField: React.FC<Props> = ({ seriesId, item, onChange }) => {
  const { busy, run } = useBusy();
  const [text, setText] = useState(String(item.heightCm ?? ''));
  const save = () => {
    const value = text.trim() ? Number(text) : null;
    if (value === item.heightCm) return;
    run('size', async () => {
      try { onChange(await setSize(seriesId, item.id, value)); } catch (err) { alert(message(err, 'Không lưu được kích thước')); }
    });
  };
  return (
    <label className="flex align-center gap-2 lg-meta">Cao thật
      <input className="form-input" style={{ width: 90 }} type="number" min={1} max={3000} value={text} disabled={!!busy} placeholder={item.kind === 'character' ? '170' : 'chưa đặt'}
        onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      cm
    </label>
  );
};

const HoldField: React.FC<Props> = ({ seriesId, item, onChange }) => {
  const { busy, run } = useBusy();
  const save = (style: HoldStyle | null) => run('hold', async () => {
    try { onChange(await setHoldStyle(seriesId, item.id, style)); } catch (err) { alert(message(err, 'Không lưu được cách cầm')); }
  });
  return (
    <label className="form-label">Cách cầm
      <select className="form-input" value={item.holdStyle ?? ''} disabled={!!busy} onChange={(e) => save((e.target.value || null) as HoldStyle | null)}>
        <option value="">Tự đoán theo hình</option>
        {Object.entries(HOLD_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
  );
};

// The line is drawn over the picture so it can be matched to the painted horizon
const HorizonField: React.FC<Props> = ({ seriesId, item, onChange }) => {
  const { busy, run } = useBusy();
  const [value, setValue] = useState(item.horizon ?? DEFAULT_HORIZON);
  const url = assetUrl(seriesId, item);
  const save = () => {
    if (value === (item.horizon ?? DEFAULT_HORIZON)) return;
    run('horizon', async () => {
      try { onChange(await setHorizon(seriesId, item.id, value)); } catch (err) { alert(message(err, 'Không lưu được đường chân trời')); }
    });
  };
  if (!url) return null;
  return (
    <details>
      <summary className="lg-meta" style={{ cursor: 'pointer' }}>Xa gần: đường chân trời</summary>
      <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
        <div style={{ position: 'relative' }}>
          <img src={url} alt="" style={{ display: 'block', width: '100%', borderRadius: 'var(--radius-sm)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${value * 100}%`, borderTop: '2px dashed var(--primary)' }} />
        </div>
        <input type="range" min={0.1} max={0.75} step={0.01} value={value} disabled={!!busy} aria-label="Đường chân trời"
          onChange={(e) => setValue(Number(e.target.value))} onPointerUp={save} onKeyUp={save} onBlur={save} />
        <p className="lg-meta" style={{ margin: 0 }}>Kéo vạch tới ngang tầm mắt của bức tranh (chỗ đất xa gặp trời). Vật đứng càng gần vạch này càng được vẽ nhỏ.</p>
      </div>
    </details>
  );
};

// Water: a boat under whoever is there. The line is drawn on the picture where its deck should sit
const WaterField: React.FC<Props> = ({ seriesId, item, onChange }) => {
  const { busy, run } = useBusy();
  const [value, setValue] = useState(item.deck ?? 0.65);
  const url = assetUrl(seriesId, item);
  const save = (deck: number | null) => run('deck', async () => {
    try { onChange(await setDeck(seriesId, item.id, deck)); } catch (err) { alert(message(err, 'Không lưu được mặt nước')); }
  });
  if (!url) return null;
  const on = item.deck != null;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex align-center gap-2 lg-meta">
        <input type="checkbox" checked={on} disabled={!!busy} onChange={(e) => save(e.target.checked ? value : null)} /> Bối cảnh trên mặt nước (có thuyền)
      </label>
      {on && (
        <>
          <div style={{ position: 'relative' }}>
            <img src={url} alt="" style={{ display: 'block', width: '100%', borderRadius: 'var(--radius-sm)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${value * 100}%`, borderTop: '2px dashed var(--primary)' }} />
          </div>
          <input type="range" min={0.4} max={0.85} step={0.01} value={value} disabled={!!busy} aria-label="Mạn thuyền"
            onChange={(e) => setValue(Number(e.target.value))} onPointerUp={() => save(value)} onKeyUp={() => save(value)} />
          <p className="lg-meta" style={{ margin: 0 }}>Kéo vạch tới chỗ chân người đứng trên thuyền, nằm giữa vùng nước.</p>
        </>
      )}
    </div>
  );
};

// What decides how big an asset is drawn: its real height, or for a background where its horizon lies
export const ScaleFields: React.FC<Props> = (props) => {
  const { item } = props;
  if (SIZED_KINDS.includes(item.kind)) {
    return (
      <>
        <SizeField key={item.heightCm ?? 'none'} {...props} />
        {item.kind === 'prop' && <HoldField {...props} />}
      </>
    );
  }
  if (item.kind !== 'background') return null;
  return (
    <>
      <HorizonField key={`${item.rev}-${item.horizon}`} {...props} />
      <WaterField key={`water-${item.rev}-${item.deck}`} {...props} />
      <SceneMapEditor key={`map-${item.rev}`} {...props} />
    </>
  );
};
