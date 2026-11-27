import React, { useRef, useState } from 'react';
import { Bot, Check, ClipboardList, Copy, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { AssetTuner, type Face } from './AssetTuner';
import { DecorPicker } from './DecorPicker';
import { ScaleFields } from './ScaleFields';
import { PoseMarker } from './DrawnActions';
import { KIND_LABEL, assetUrl, clearAsset, readImage, uploadAsset, type AssetItem, type AssetKind, type AssetSeries } from './animationWorker';

const ORDER: AssetKind[] = ['character', 'body', 'hands', 'action', 'heads', 'mouths', 'expression', 'background', 'foreground', 'plant', 'prop', 'animal'];
// What to attach as the reference when asking for the picture
const REFERENCE: Partial<Record<AssetKind, string>> = { body: 'nhân vật', hands: 'nhân vật', action: 'nhân vật', heads: 'nhân vật', expression: 'nhân vật', mouths: 'nhân vật', foreground: 'bối cảnh' };
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// The pictures to attach in ChatGPT for a card: its character (or background), and for a sheet seen from another
// side the same sheet from the side and from the front; a mouth sheet sits on the heads of its own view
const referencesOf = (series: AssetSeries, item: AssetItem): AssetItem[] => {
  const sibling = (kind: AssetKind, view: string | null) => series.items.find((entry) => entry.kind === kind && entry.of === item.of && (entry.view ?? null) === view);
  const picks = [series.items.find((entry) => entry.id === item.of)];
  if (item.kind === 'mouths') picks.push(sibling('heads', item.view ?? null));
  if (item.kind === 'hands') picks.push(sibling('body', null));
  if (item.view) picks.push(sibling(item.kind, null), item.view !== 'front' ? sibling(item.kind, 'front') : undefined);
  return picks.filter((entry): entry is AssetItem => !!entry && entry.id !== item.id);
};
// References first: a sheet can be drawn only once what it must match is there
const DRAW_ORDER: AssetKind[] = ['character', 'background', 'prop', 'plant', 'animal', 'body', 'hands', 'heads', 'mouths', 'expression', 'action', 'foreground'];
const VIEW_ORDER = [null, 'front', 'quarter', 'quarter-back', 'back'];

// Every missing picture as one text to work down in a single ChatGPT conversation
const missingBrief = (series: AssetSeries) => {
  const missing = series.items.filter((item) => !item.file)
    .sort((a, b) => DRAW_ORDER.indexOf(a.kind) - DRAW_ORDER.indexOf(b.kind) || VIEW_ORDER.indexOf(a.view ?? null) - VIEW_ORDER.indexOf(b.view ?? null));
  const steps = missing.map((item, n) => {
    const refs = referencesOf(series, item).map((ref) => {
      const url = assetUrl(series.id, { ...ref, parts: [] });
      return ref.file ? `"${ref.name}"${url ? ` (${url})` : ''}` : `"${ref.name}" (chưa có ảnh: vẽ mục đó trước)`;
    });
    return `### ${n + 1}. ${item.name}\n${refs.length ? `Đính kèm: ${refs.join(', ')}\n` : ''}Prompt:\n${item.prompt}`;
  });
  return { count: missing.length, text: `Series "${series.title}": ${missing.length} ảnh còn thiếu.\nVẽ lần lượt trong CÙNG MỘT cuộc trò chuyện ChatGPT để màu và nét giống nhau. Mỗi mục: đính kèm ảnh mẫu, dán prompt, tải ảnh về rồi kéo vào thẻ cùng tên trên trang Xưởng hoạt hình.\n\n${steps.join('\n\n')}` };
};

const AssetCard: React.FC<{ seriesId: string; item: AssetItem; refName: string | null; face?: Face; heads?: AssetItem; onChange: (series: AssetSeries) => void; onBrief: (items: string[]) => void; series: AssetSeries }> = ({ seriesId, item, refName, face, heads, onChange, onBrief, series }) => {
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
        {!item.file && referencesOf(series, item).length > 0 && (
          <p className="lg-meta" style={{ margin: 0 }}>Đính kèm khi nhờ ChatGPT vẽ: {referencesOf(series, item).map((ref) => `"${ref.name}"${ref.file ? '' : ' (chưa có, vẽ trước)'}`).join(', ')}.</p>
        )}
        {refName && !item.file && !referencesOf(series, item).length && <p className="lg-meta" style={{ margin: 0 }}>Đính kèm ảnh {REFERENCE[item.kind]} "{refName}" khi nhờ ChatGPT vẽ.</p>}
        {/* key on rev: the slider restarts from the saved sensitivity after each processing */}
        {item.kind === 'action' && <PoseMarker key={item.rev} seriesId={seriesId} item={item} onChange={onChange} />}
        <AssetTuner key={`${item.id}-${item.rev}-${item.version}-${item.rig?.scale ?? 0}`} seriesId={seriesId} item={item} face={face} heads={heads} onChange={onChange} />
        {item.grounded && <p className="lg-meta" style={{ margin: 0 }}>Ảnh này vẽ cả mặt đất nên đang được đặt sau nhân vật. Vẽ lại chỉ cỏ hoặc cành ở mép khung thì sẽ nằm trước.</p>}
        {item.from && <p className="lg-meta" style={{ margin: 0 }}>Lấy từ kho, phong cách: {item.style}</p>}
        <ScaleFields seriesId={seriesId} item={item} onChange={onChange} />
        {item.kind === 'background' && <DecorPicker series={series} background={item} onChange={onChange} />}
        <details>
          <summary className="lg-meta" style={{ cursor: 'pointer' }}>Prompt cho ChatGPT</summary>
          <pre className="an-prompt">{item.prompt}</pre>
        </details>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} Chép prompt</button>
          <button className="btn btn-ghost btn-sm" title="Giao Claude Code Desktop vẽ ảnh này" onClick={() => onBrief([item.id])}><Bot size={14} /> Giao Claude</button>
          {item.file && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('clear', async () => { try { onChange(await clearAsset(seriesId, item.id)); } catch (err) { alert(message(err, 'Không xoá được ảnh')); } })}><Trash2 size={14} /> Bỏ ảnh</button>}
        </div>
      </div>
    </div>
  );
};

export const AssetBoard: React.FC<{ series: AssetSeries; onChange: (series: AssetSeries) => void; onBrief: (items: string[]) => void }> = ({ series, onChange, onBrief }) => {
  const nameOf = (id: string | null) => series.items.find((item) => item.id === id)?.name ?? null;
  const headsOf = (character: string | null, view?: string | null) => series.items.find((entry) => entry.kind === 'heads' && entry.of === character && (entry.view ?? null) === (view ?? null));
  // The mouth is placed on the neutral head of a rigged character, else on the whole character
  const faceOf = (character: string | null, view?: string | null): Face => {
    const head = headsOf(character, view)?.parts.find((part) => part.name === 'neutral');
    const whole = series.items.find((entry) => entry.id === character);
    return head ? { part: head, name: `${whole?.name ?? character}: đầu bình thường` } : { part: whole?.parts[0], name: whole?.name ?? String(character) };
  };
  const [copied, setCopied] = useState(false);
  const brief = missingBrief(series);
  const copyAll = () => navigator.clipboard.writeText(brief.text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => alert('Không chép được'));
  return (
    <div className="flex flex-col gap-4">
      {brief.count > 0 && (
        <div className="card flex align-center gap-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <p className="lg-meta" style={{ margin: 0 }}>Còn {brief.count} ảnh chưa có. Chép một lần mọi prompt theo đúng thứ tự vẽ, mỗi mục ghi rõ ảnh mẫu cần đính kèm.</p>
          <button className="btn btn-secondary btn-sm" onClick={copyAll}>{copied ? <Check size={14} /> : <ClipboardList size={14} />} {copied ? 'Đã chép' : 'Chép prompt phần còn thiếu'}</button>
        </div>
      )}
      {ORDER.map((kind) => {
        const items = series.items.filter((item) => item.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px', fontWeight: 600 }}>{KIND_LABEL[kind]} <span className="lg-meta">{items.filter((i) => i.file).length}/{items.length}</span></h2>
            <div className="an-grid">
              {items.map((item) => <AssetCard key={item.id} seriesId={series.id} item={item} refName={REFERENCE[item.kind] ? nameOf(item.of) : null}
                face={item.kind === 'mouths' ? faceOf(item.of, item.view) : undefined} heads={item.kind === 'body' ? headsOf(item.of, item.view) : undefined} onChange={onChange} onBrief={onBrief} series={series} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
};
