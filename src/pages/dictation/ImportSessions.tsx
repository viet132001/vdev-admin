import React, { useRef, useState } from 'react';
import { api, authFetch } from '../../services/api';
import { X, Upload, Download, FileSpreadsheet, FileJson, CircleAlert, ChevronRight, ChevronDown } from 'lucide-react';

// Session import — src/doc/dictation-api.md section 12

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMPORT_URL = '/api/dictation/sessions/import';

interface ImportSessionsProps {
  onClose: () => void;
  onImported: (sessions: any[]) => void;
}

interface ImportError {
  message: string;
  errors: string[];
}

const toImportError = (raw: string, status: number): ImportError => {
  try {
    const json = JSON.parse(raw);
    const errors = Array.isArray(json.errors) ? json.errors.map((e: any) => (typeof e === 'string' ? e : e?.message || JSON.stringify(e))) : [];
    return { message: json.message || `Lỗi ${status}`, errors };
  } catch {
    return { message: status === 413 ? 'File vượt quá 5MB' : raw || `Lỗi ${status}`, errors: [] };
  }
};

// Multipart upload to the real API; when the backend is unreachable, hand the file text to the mock instead
const postImport = async (file: File, dryRun: boolean) => {
  const formData = new FormData();
  formData.append('file', file);
  let response: Response;
  try {
    response = await authFetch(`${IMPORT_URL}?dryRun=${dryRun}`, { method: 'POST', body: formData });
  } catch (err: any) {
    if (err?.name !== 'TypeError') throw err;
    try {
      return await api.post(`${IMPORT_URL}?dryRun=${dryRun}`, { fileName: file.name, content: await file.text() });
    } catch (mockErr: any) {
      throw toImportError(mockErr?.message || '', 400);
    }
  }
  const text = await response.text();
  if (!response.ok) throw toImportError(text, response.status);
  const json = JSON.parse(text);
  return json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
};

const TEMPLATE_JSON = {
  sessions: [
    {
      title: 'Daily Conversation',
      description: 'Hội thoại hằng ngày',
      level: 'A2',
      lessons: [
        {
          title: 'At the coffee shop',
          sentences: [
            {
              text: 'Could I get a large latte, please?',
              translation: 'Cho tôi một ly latte lớn được không?',
              note: 'Could I get...? — cách gọi món lịch sự',
              vocabularies: [{ term: 'large latte', meaning: 'ly latte lớn' }, { term: 'please', meaning: 'làm ơn' }]
            },
            { text: 'Can I pay by card?', vocabularies: { 'pay by card': 'trả bằng thẻ' } },
            'Is it for here or to go?'
          ]
        }
      ]
    }
  ]
};

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const downloadTemplate = async (format: 'xlsx' | 'json') => {
  const fallbackName = `dictation-import-template.${format}`;
  try {
    const response = await authFetch(`${IMPORT_URL}/template?format=${format}`);
    if (!response.ok) throw new Error(toImportError(await response.text(), response.status).message);
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') || '');
    saveBlob(await response.blob(), match ? decodeURIComponent(match[1]) : fallbackName);
  } catch (err: any) {
    if (err?.name !== 'TypeError') {
      alert(err?.message || 'Tải file mẫu thất bại');
      return;
    }
    // Backend unreachable: the JSON template can be produced locally, the Excel one cannot
    if (format === 'json') saveBlob(new Blob([JSON.stringify(TEMPLATE_JSON, null, 2)], { type: 'application/json' }), fallbackName);
    else alert('Không kết nối được backend nên chưa tải được file mẫu Excel. Hãy dùng mẫu JSON.');
  }
};

export const ImportSessions: React.FC<ImportSessionsProps> = ({ onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const pickFile = (picked: File | undefined) => {
    setPreview(null);
    setError(null);
    setExpanded({});
    if (!picked) return;
    const ext = picked.name.split('.').pop()?.toLowerCase();
    if (ext !== 'json' && ext !== 'xlsx') {
      setFile(null);
      setError({ message: 'Chỉ hỗ trợ file .json hoặc .xlsx (file .xls / .csv cần lưu lại thành .xlsx).', errors: [] });
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setFile(null);
      setError({ message: 'File vượt quá 5MB.', errors: [] });
      return;
    }
    setFile(picked);
    check(picked);
  };

  const check = async (target: File) => {
    setBusy('check');
    try {
      setPreview(await postImport(target, true));
    } catch (err: any) {
      setError(err?.message !== undefined && Array.isArray(err?.errors) ? err : { message: err?.message || 'Kiểm tra file thất bại', errors: [] });
    } finally {
      setBusy(null);
    }
  };

  const confirmImport = async () => {
    if (!file) return;
    setBusy('import');
    try {
      const result = await postImport(file, false);
      onImported(result?.sessions || []);
    } catch (err: any) {
      setPreview(null);
      setError(err?.message !== undefined && Array.isArray(err?.errors) ? err : { message: err?.message || 'Import thất bại', errors: [] });
    } finally {
      setBusy(null);
    }
  };

  const summary = preview?.summary;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Import session</h3>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body flex flex-col gap-4">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Tạo nhiều session, bài và câu một lần từ file <b>.xlsx</b> hoặc <b>.json</b> (tối đa 5MB, 50 session, 5000 câu).
            File được kiểm tra toàn bộ trước khi tạo — có lỗi ở bất kỳ đâu thì không tạo gì.
          </p>

          <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>File mẫu:</span>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadTemplate('xlsx')}><Download size={14} /> Excel</button>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadTemplate('json')}><Download size={14} /> JSON</button>
          </div>

          <div
            className="dc-dropzone"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
          >
            {file ? (
              <span className="flex align-center gap-2">
                {file.name.toLowerCase().endsWith('.json') ? <FileJson size={18} /> : <FileSpreadsheet size={18} />}
                <b>{file.name}</b>
                <span style={{ color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB · bấm để chọn file khác</span>
              </span>
            ) : (
              <span className="flex align-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <Upload size={18} /> Kéo thả file vào đây hoặc bấm để chọn
              </span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
          />

          {busy === 'check' && <div className="loading-container" style={{ padding: 16 }}><span className="spinner"></span><span>Đang kiểm tra file...</span></div>}

          {error && (
            <div className="alert-banner alert-banner-danger" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginBottom: 0 }}>
              <span className="flex align-center gap-2" style={{ fontWeight: 600 }}><CircleAlert size={16} /> {error.message}</span>
              {error.errors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 22, maxHeight: 200, overflowY: 'auto', fontSize: '0.8rem' }}>
                  {error.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {error.errors.length > 0 && <span style={{ fontSize: '0.75rem' }}>Sửa file rồi chọn lại để kiểm tra.</span>}
            </div>
          )}

          {preview && summary && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-2">
                {[['Session', summary.sessions], ['Bài', summary.lessons], ['Câu', summary.sentences], ['Từ vựng', summary.vocabularies ?? 0]].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', maxHeight: 260, overflowY: 'auto' }}>
                {(preview.sessions || []).map((s: any, i: number) => (
                  <div key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <button className="tw-nav-item" style={{ borderRadius: 0, padding: '8px 10px' }} onClick={() => setExpanded({ ...expanded, [i]: !expanded[i] })}>
                      {expanded[i] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</b>
                      <span className="badge">{s.level}</span>
                      <span className="tw-count" style={{ display: 'inline' }}>{s.lessonCount} bài · {s.sentenceCount} câu</span>
                    </button>
                    {expanded[i] && (
                      <div style={{ padding: '0 10px 8px 34px', fontSize: '0.8rem' }}>
                        {s.description && <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{s.description}</div>}
                        {(s.lessons || []).length === 0 && <div style={{ color: 'var(--text-muted)' }}>Chưa có bài</div>}
                        {(s.lessons || []).map((l: any, j: number) => (
                          <div key={j} className="flex justify-between" style={{ padding: '2px 0' }}>
                            <span>{j + 1}. {l.title}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{l.sentenceCount} câu</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" disabled={!preview || busy !== null} onClick={confirmImport}>
            {busy === 'import' ? 'Đang import...' : preview ? `Import ${summary?.sessions ?? 0} session` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
