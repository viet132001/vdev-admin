import React, { useRef, useState } from 'react';
import { Bot, Check, Copy, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { AssetTuner, type Face } from './AssetTuner';
import { KIND_LABEL, assetUrl, copyBrief, clearAsset, readImage, uploadAsset, type AssetItem, type AssetKind, type AssetSeries } from './animationWorker';

const ORDER: AssetKind[] = ['character', 'body', 'heads', 'mouths', 'expression', 'background', 'foreground', 'prop'];
// What to attach as the reference when asking for the picture
const REFERENCE: Partial<Record<AssetKind, string>> = { body: 'nhân vật', heads: 'nhân vật', expression: 'nhân vật', mouths: 'nhân vật', foreground: 'bối cảnh' };
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const AssetCard: React.FC<{ seriesId: string; item: AssetItem; refName: string | null; face?: Face; heads?: AssetItem; onChange: (series: AssetSeries) => void; onHanded: () => void }> = ({ seriesId, item, refName, face, heads, onChange, onHanded }) => {
  const { busy, run } = useBusy();
  const [copied, setCopied] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = assetUrl(seriesId, item);

  const take = (file: File | null | undefined) => {
    if (!file) return;
    run('upload', async () => {
      try {
        onChange(await uploadAsset(seriesId, item.id, await readImage(file)));
      } catch (err) {
        alert(message(err, 'Không tải được ảnh'));
      }
    });
  };

  const copy = () => navigator.clipboard.writeText(item.prompt).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => alert('Không chép được, hãy bôi đen prompt và chép tay'));

  return (
    <div
      className={`card an-card${over ? ' over' : ''}`}
      tabIndex={0}
      // Ctrl+V of a screenshot or a copied image while the card is focused
      onPaste={(e) => { const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/')); if (file) { e.preventDefault(); take(file); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
    >
      <div className={`an-thumb${item.parts.length ? ' an-checker' : ''}`} onClick={() => input.current?.click()} title="Bấm để chọn ảnh, hoặc kéo thả, hoặc dán (Ctrl+V)">
        {busy === 'upload' ? <Loader2 className="spin" size={20} /> : url ? <img src={`${url}`} alt={item.name} /> : <span className="an-empty"><ImagePlus size={20} />Dán hoặc kéo ảnh vào</span>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="an-body">
        <div className="flex align-center gap-2" style={{ justifyContent: 'space-between' }}>
          <strong className="vl-title">{item.name}</strong>
          <span className={`badge ${item.file ? 'badge-success' : 'badge-warning'}`}>{item.file ? 'Đã có' : 'Chưa có'}</span>
        </div>
        {refName && !item.file && <p className="lg-meta" style={{ margin: 0 }}>Đính kèm ảnh {REFERENCE[item.kind]} "{refName}" khi nhờ ChatGPT vẽ.</p>}
        {/* key on rev: the slider restarts from the saved sensitivity after each processing */}
        <AssetTuner key={`${item.id}-${item.rev}-${item.version}-${item.rig?.scale ?? 0}`} seriesId={seriesId} item={item} face={face} heads={heads} onChange={onChange} />
        <details>
          <summary className="lg-meta" style={{ cursor: 'pointer' }}>Prompt cho ChatGPT</summary>
          <pre className="an-prompt">{item.prompt}</pre>
        </details>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} Chép prompt</button>
          <button className="btn btn-ghost btn-sm" disabled={!!busy} title="Chép việc vẽ ảnh này cho Claude Code Desktop" onClick={() => run('brief', async () => { try { await copyBrief(seriesId, [item.id], onHanded); } catch (err) { alert(message(err, 'Không tạo được việc cho Claude')); } })}><Bot size={14} /> Giao Claude</button>
          {item.file && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('clear', async () => { try { onChange(await clearAsset(seriesId, item.id)); } catch (err) { alert(message(err, 'Không xoá được ảnh')); } })}><Trash2 size={14} /> Bỏ ảnh</button>}
        </div>
      </div>
    </div>
  );
};

export const AssetBoard: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void; onHanded: () => void }> = ({ series, onChange, onHanded }) => {
  const nameOf = (id: string | null) => series.items.find((item) => item.id === id)?.name ?? null;
  const headsOf = (character: string | null) => series.items.find((entry) => entry.kind === 'heads' && entry.of === character);
  // The mouth is placed on the neutral head of a rigged character, else on the whole character
  const faceOf = (character: string | null): Face => {
    const head = headsOf(character)?.parts.find((part) => part.name === 'neutral');
    const whole = series.items.find((entry) => entry.id === character);
    return head ? { part: head, name: `${whole?.name ?? character}: đầu bình thường` } : { part: whole?.parts[0], name: whole?.name ?? String(character) };
  };
  return (
    <div className="flex flex-col gap-4">
      {ORDER.map((kind) => {
        const items = series.items.filter((item) => item.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px', fontWeight: 600 }}>{KIND_LABEL[kind]} <span className="lg-meta">{items.filter((i) => i.file).length}/{items.length}</span></h2>
            <div className="an-grid">
              {items.map((item) => <AssetCard key={item.id} seriesId={series.id} item={item} refName={REFERENCE[item.kind] ? nameOf(item.of) : null}
                face={item.kind === 'mouths' ? faceOf(item.of) : undefined} heads={item.kind === 'body' ? headsOf(item.of) : undefined} onChange={onChange} onHanded={onHanded} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
};
