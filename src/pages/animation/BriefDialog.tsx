import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, Loader2, X } from 'lucide-react';
import { assetBrief } from './animationWorker';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// The task for Claude Code Desktop, shown before copying: the copy happens on the click itself, so the browser never
// refuses it, and the text can still be selected by hand if the clipboard is blocked
export const BriefDialog: React.FC<{ seriesId: string; items: string[] | null; onClose: () => void; onHanded: () => void }> = ({ seriesId, items, onClose, onHanded }) => {
  const [text, setText] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!items) return;
    setText(null); setProblem(null); setCopied(false);
    assetBrief(seriesId, items).then(setText).catch((err) => setProblem(message(err, 'Không tạo được việc cho Claude')));
  }, [seriesId, items]);
  if (!items) return null;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked: select it so Ctrl+C / Cmd+C works
      area.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    onHanded();
  };
  const count = text ? (text.match(/^### /gm) ?? []).length : 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }} onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 720, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex align-center gap-2"><Bot size={18} /><h3 style={{ margin: 0 }}>Giao Claude vẽ</h3></div>
          <button className="icon-btn" title="Đóng" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body flex flex-col gap-3">
          {!text && !problem && <div className="flex align-center gap-2 lg-meta"><Loader2 size={14} className="spin" /> Đang soạn việc…</div>}
          {problem && <p className="lg-error" style={{ margin: 0 }}>{problem}</p>}
          {text === '' && <p style={{ margin: 0 }}>Không còn ảnh nào thiếu.</p>}
          {text && (
            <>
              <p className="lg-meta" style={{ margin: 0 }}>
                {count} ảnh. Bấm "Chép", mở Claude Code Desktop và dán vào: Claude sẽ mở ChatGPT, vẽ từng ảnh, tải về Downloads rồi đưa vào xưởng. Trang này tự cập nhật khi ảnh về.
              </p>
              <textarea ref={area} className="form-input an-prompt" readOnly rows={12} value={text} onFocus={(e) => e.currentTarget.select()} />
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" disabled={!text} onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Đã chép' : 'Chép'}</button>
        </div>
      </div>
    </div>
  );
};
