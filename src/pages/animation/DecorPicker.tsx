import React from 'react';
import { Shuffle } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { setDecor, type AssetItem, type AssetSeries } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// The plants that grow in a background: the engine sets big clumps in the front corners and small ones on the ground
// behind the characters, each swaying in the wind on its own
export const DecorPicker: React.FC<{ series: AssetSeries; background: AssetItem; onChange: (series: AssetSeries) => void }> = ({ series, background, onChange }) => {
  const { busy, run } = useBusy();
  const plants = series.items.filter((item) => item.kind === 'plant');
  if (!plants.length) return <p className="lg-meta" style={{ margin: 0 }}>Chưa có cây cỏ nào. Thêm ở "Thêm bối cảnh / đạo cụ / cây cỏ" cuối trang để cảnh có gió lay.</p>;
  const chosen = [...new Set((background.decor ?? []).map((spot) => spot.id))];
  const save = (ids: string[], seed: number) => run('decor', async () => {
    try { onChange(await setDecor(series.id, background.id, ids, seed)); } catch (err) { alert(message(err, 'Không lưu được cây cỏ')); }
  });
  const seed = Math.floor(Math.random() * 100000);
  return (
    <details>
      <summary className="lg-meta" style={{ cursor: 'pointer' }}>Cây cỏ lay theo gió {chosen.length ? `(${chosen.length})` : ''}</summary>
      <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          {plants.map((plant) => (
            <label key={plant.id} className="flex align-center gap-1 lg-meta">
              <input type="checkbox" disabled={!!busy} checked={chosen.includes(plant.id)}
                onChange={(e) => save(e.target.checked ? [...chosen, plant.id] : chosen.filter((id) => id !== plant.id), seed)} />
              {plant.name}{plant.parts.length ? '' : ' (chưa có ảnh)'}
            </label>
          ))}
        </div>
        {chosen.length > 0 && (
          <div><button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => save(chosen, seed)}><Shuffle size={14} /> Xếp lại</button></div>
        )}
      </div>
    </details>
  );
};
