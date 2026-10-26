import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Volume2, Upload, FileAudio, X, ClipboardList } from 'lucide-react';
import { formatVocabularyText, parseVocabularyText, splitSentences } from './grading';
import { loadSettings, playSentence, uploadAudio } from './media';

interface SentenceManagerProps {
  lessonId: string;
  onChanged: () => void;
  onConfirm: (title: string, message: string, action: () => Promise<void>) => void;
}

interface SentenceForm {
  id?: string;
  text: string;
  translation: string;
  note: string;
  vocabularies: string;
}

const emptyForm: SentenceForm = { text: '', translation: '', note: '', vocabularies: '' };

export const SentenceManager: React.FC<SentenceManagerProps> = ({ lessonId, onChanged, onConfirm }) => {
  const [sentences, setSentences] = useState<any[] | null>(null);
  const [form, setForm] = useState<SentenceForm | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/dictation/lessons/${lessonId}`, { noCache: true });
      setSentences(data.sentences || []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được danh sách câu'));
    }
  }, [lessonId]);

  useEffect(() => {
    setSentences(null);
    load();
  }, [load]);

  const run = async (fn: () => Promise<any>, fallback: string) => {
    try {
      await fn();
      await load();
      onChanged();
      return true;
    } catch (err) {
      alert(getErrorMessage(err, fallback));
      return false;
    }
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !form.text.trim()) return;
    const { items: vocabularies, invalid } = parseVocabularyText(form.vocabularies);
    if (invalid.length) {
      alert(`Từ vựng cần dạng "từ: nghĩa" (mỗi dòng một từ):\n${invalid.join('\n')}`);
      return;
    }
    if (vocabularies.length > 20) {
      alert('Tối đa 20 từ vựng mỗi câu');
      return;
    }
    const payload = { text: form.text.trim(), translation: form.translation.trim() || null, note: form.note.trim() || null, vocabularies };
    const ok = await run(
      () => (form.id ? api.patch(`/api/dictation/sentences/${form.id}`, payload) : api.post(`/api/dictation/lessons/${lessonId}/sentences`, payload)),
      'Lưu câu thất bại'
    );
    // Keep the form open (empty) after adding so several sentences can be entered in a row
    if (ok) setForm(form.id ? null : { ...emptyForm });
  };

  const bulkItems = splitSentences(bulkText);

  const saveBulk = async () => {
    if (bulkItems.length === 0) return;
    if (bulkItems.length > 200) {
      alert('Tối đa 200 câu mỗi lần nhập');
      return;
    }
    const ok = await run(() => api.post(`/api/dictation/lessons/${lessonId}/sentences/bulk`, { items: bulkItems }), 'Nhập câu thất bại');
    if (ok) {
      setBulkText('');
      setBulkOpen(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    if (!sentences) return;
    const ids = sentences.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setSentences(ids.map((id) => sentences.find((s) => s.id === id)));
    run(() => api.patch(`/api/dictation/lessons/${lessonId}/sentences/reorder`, { ids }), 'Sắp xếp thất bại');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sentenceId = uploadTarget.current;
    e.target.value = '';
    if (!file || !sentenceId) return;
    if (!file.type.startsWith('audio/')) {
      alert('Chỉ hỗ trợ file âm thanh');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File tối đa 5MB');
      return;
    }
    setUploadingId(sentenceId);
    try {
      const fileId = await uploadAudio(file);
      await run(() => api.patch(`/api/dictation/sentences/${sentenceId}`, { audioFileId: fileId }), 'Gắn audio thất bại');
    } catch (err) {
      alert(getErrorMessage(err, 'Tải audio thất bại'));
    } finally {
      setUploadingId(null);
    }
  };

  if (!sentences) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải...</span></div>;
  }

  const settings = loadSettings();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setForm({ ...emptyForm })}><Plus size={16} /> Thêm câu</button>
        <button className="btn btn-secondary" onClick={() => setBulkOpen(true)}><ClipboardList size={16} /> Nhập nhiều câu</button>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
          {sentences.length} câu · câu không có file audio sẽ được đọc bằng giọng tiếng Anh của trình duyệt
        </span>
      </div>

      {form && (
        <form className="card flex flex-col gap-2" onSubmit={saveForm}>
          <div className="flex justify-between align-center">
            <b>{form.id ? 'Sửa câu' : 'Thêm câu mới'}</b>
            <button type="button" className="icon-btn" onClick={() => setForm(null)}><X size={16} /></button>
          </div>
          <input autoFocus required maxLength={500} className="form-input" placeholder="Câu tiếng Anh *" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          <input className="form-input" placeholder="Nghĩa tiếng Việt" value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} />
          <textarea className="form-input" rows={2} style={{ resize: 'vertical' }} placeholder="Ghi chú: ngữ pháp, cách dùng..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <textarea
            className="form-input"
            rows={3}
            style={{ resize: 'vertical' }}
            placeholder={'Từ vựng (dùng cho game thủ thành), mỗi dòng một từ:\nlarge latte: ly latte lớn\nplease: làm ơn'}
            value={form.vocabularies}
            onChange={(e) => setForm({ ...form, vocabularies: e.target.value })}
          />
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
            {form.text.trim() && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => playSentence({ text: form.text }, settings.rate, settings.voiceURI)}>
                <Volume2 size={14} /> Nghe thử
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>Hủy</button>
            <button type="submit" className="btn btn-primary btn-sm">{form.id ? 'Lưu' : 'Thêm'}</button>
          </div>
        </form>
      )}

      <div className="table-container" style={{ marginTop: 0 }}>
        <table>
          <thead>
            <tr><th style={{ width: 40 }}>#</th><th>Câu tiếng Anh</th><th>Nghĩa / ghi chú</th><th style={{ width: 120 }}>Audio</th><th style={{ width: 150 }}></th></tr>
          </thead>
          <tbody>
            {sentences.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chưa có câu nào. Thêm từng câu hoặc dán cả đoạn văn bằng “Nhập nhiều câu”.</td></tr>
            )}
            {sentences.map((s, i) => (
              <tr key={s.id}>
                <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{s.text}</td>
                <td>
                  <div style={{ fontSize: '0.85rem' }}>{s.translation || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
                  {s.note && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ghi chú: {s.note}</div>}
                  {s.vocabularies?.length > 0 && (
                    <div className="dc-vocab-list" style={{ marginTop: 4 }}>
                      {s.vocabularies.map((v: any) => <span key={v.term} className="dc-vocab-chip"><b>{v.term}</b> {v.meaning}</span>)}
                    </div>
                  )}
                </td>
                <td>
                  <div className="flex align-center" style={{ gap: 2 }}>
                    <button className="icon-btn" title="Nghe" onClick={() => playSentence(s, settings.rate, settings.voiceURI)}><Volume2 size={14} /></button>
                    {uploadingId === s.id ? (
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : s.audioFileId ? (
                      <>
                        <span title="Có file audio" style={{ color: 'var(--success)', display: 'flex' }}><FileAudio size={14} /></span>
                        <button
                          className="icon-btn danger"
                          title="Gỡ file audio (dùng giọng trình duyệt)"
                          onClick={() => run(() => api.patch(`/api/dictation/sentences/${s.id}`, { audioFileId: null }), 'Gỡ audio thất bại')}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button className="icon-btn" title="Tải file audio lên" onClick={() => { uploadTarget.current = s.id; fileInput.current?.click(); }}>
                        <Upload size={14} />
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <div className="flex" style={{ gap: 2, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                    <button className="icon-btn" disabled={i === sentences.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                    <button className="icon-btn" onClick={() => setForm({ id: s.id, text: s.text, translation: s.translation || '', note: s.note || '', vocabularies: formatVocabularyText(s.vocabularies) })}><Pencil size={14} /></button>
                    <button
                      className="icon-btn danger"
                      onClick={() => onConfirm('Xóa câu', `Xóa câu “${s.text}”?`, async () => { await run(() => api.delete(`/api/dictation/sentences/${s.id}`), 'Xóa câu thất bại'); })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <input ref={fileInput} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFile} />

      {bulkOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Nhập nhiều câu</h3>
              <button className="hamburger-btn" onClick={() => setBulkOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body flex flex-col gap-2">
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Dán đoạn văn tiếng Anh — hệ thống tự tách câu theo dấu <b>. ! ?</b> và xuống dòng.
                Muốn kèm nghĩa, viết mỗi câu một dòng dạng <code>English sentence | Nghĩa tiếng Việt</code>.
              </p>
              <textarea
                autoFocus
                className="form-input"
                rows={8}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                placeholder={'Could I get a large latte, please? | Cho tôi một ly latte lớn được không?\nIs it for here or to go?'}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              {bulkItems.length > 0 && (
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  {bulkItems.map((item, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                      <b style={{ color: 'var(--text-muted)', marginRight: 6 }}>{i + 1}.</b>{item.text}
                      {item.translation && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 20 }}>{item.translation}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkOpen(false)}>Hủy</button>
              <button className="btn btn-primary" disabled={bulkItems.length === 0} onClick={saveBulk}>Thêm {bulkItems.length} câu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
