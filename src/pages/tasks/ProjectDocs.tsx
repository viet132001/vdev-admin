import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { X, Paperclip, FileText, Image as ImageIcon, FolderOpen, Library, Trash2, CircleAlert, Upload, CircleCheck, CircleHelp } from 'lucide-react';
import {
  MAX_DOC_BYTES, basename, ensureProjectFolder, formatBytes, getDocsRoot, getStoredRoot, isImage, isLocalDocsSupported,
  pickDocsRoot, readDocument, removeDocument, sha256, slugify, writeDocument
} from './localDocs';
import { useBusy } from './agent';

// ---------- upload ----------

/** Server-side docs root (absolute path) — needed so the runner can find the files. */
export const loadAgentSettings = async () => {
  try {
    return await api.get('/api/agent/settings', { noCache: true });
  } catch {
    return null;
  }
};

/**
 * Writes the files into <docsRoot>/<project folder>/<subPath> on this machine and registers them on the server.
 * Creates the project folder (named after the project) on first use. Must run inside a click handler
 * because the browser may ask for folder permission again.
 */
export const uploadDocuments = async (
  project: any,
  files: { file: File; name?: string; note?: string }[],
  subPath: string[],
  alwaysInclude = false
) => {
  const settings = await loadAgentSettings();
  if (!settings?.docsRoot) throw new Error('Chưa cấu hình thư mục tài liệu — mở "Claude trên máy này" để cài đặt.');
  const root = await getDocsRoot(true);
  if (!root) throw new Error('Trình duyệt chưa được cấp quyền thư mục tài liệu — mở "Claude trên máy này" và chọn lại thư mục.');

  // The caller may hold stale project data from before the first upload created the folder
  let docsFolder = project.docsFolder ?? (await api.get(`/api/task-projects/${project.id}`, { noCache: true }))?.docsFolder ?? null;
  if (!docsFolder) {
    const all = await api.get('/api/task-projects?includeArchived=true', { noCache: true });
    const taken = (Array.isArray(all) ? all : []).filter((p: any) => p.id !== project.id && p.docsFolder).map((p: any) => p.docsFolder);
    const { folder } = await ensureProjectFolder(root, project, taken);
    await api.patch(`/api/task-projects/${project.id}`, { docsFolder: folder });
    docsFolder = folder;
  }
  const { dir } = await ensureProjectFolder(root, { ...project, docsFolder }, []);

  const created: any[] = [];
  for (const item of files) {
    const relativePath = await writeDocument(dir, subPath, item.file, item.name);
    const doc = await api.post(`/api/task-projects/${project.id}/documents`, {
      relativePath,
      name: basename(relativePath),
      mimeType: item.file.type || 'application/octet-stream',
      size: item.file.size,
      sha256: await sha256(item.file),
      alwaysInclude,
      ...(item.note ? { note: item.note } : {})
    });
    created.push({ document: doc, note: item.note || null });
  }
  return { docsFolder, created };
};

const openLocal = async (docsFolder: string | null | undefined, doc: any) => {
  try {
    const root = await getDocsRoot(true);
    if (!root || !docsFolder) throw new Error('Không mở được: chưa cấp quyền thư mục tài liệu trên trình duyệt này.');
    const file = await readDocument(root, docsFolder, doc.relativePath);
    window.open(URL.createObjectURL(file), '_blank', 'noopener');
  } catch (err: any) {
    alert(err?.name === 'NotFoundError' ? 'Không tìm thấy file trên máy — file đã bị xóa hoặc đổi tên.' : err?.message || 'Không mở được file');
  }
};

// ---------- thumbnails ----------

const Thumb: React.FC<{ docsFolder?: string | null; doc: any; file?: File }> = ({ docsFolder, doc, file }) => {
  const [url, setUrl] = useState<string | null>(null);
  const mime = file?.type || doc?.mimeType;

  useEffect(() => {
    if (!isImage(mime)) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const source = file || (docsFolder && doc ? await (async () => {
          const root = await getDocsRoot(false); // previews never prompt
          return root ? readDocument(root, docsFolder, doc.relativePath) : null;
        })() : null);
        if (source && !cancelled) {
          objectUrl = URL.createObjectURL(source);
          setUrl(objectUrl);
        }
      } catch {
        // Missing file: the generic icon is shown
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mime, file, docsFolder, doc]);

  if (url) return <img src={url} alt="" className="tw-attach-thumb" />;
  return <span className="tw-attach-thumb icon">{isImage(mime) ? <ImageIcon size={16} /> : <FileText size={16} />}</span>;
};

// ---------- picker (plan form / reject form) ----------

export interface PendingAttachment {
  key: string;
  file?: File;          // new file, written on submit
  document?: any;       // existing library document
  note: string;
}

let pastedCounter = 0;

/** Turns pasted clipboard images into pending attachments; attach to a textarea's onPaste. */
export const imagesFromPaste = (e: React.ClipboardEvent): PendingAttachment[] => {
  const files = Array.from(e.clipboardData.files || []).filter((f) => isImage(f.type));
  if (files.length) e.preventDefault();
  return files.map((f) => {
    pastedCounter += 1;
    const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const named = new File([f], `anh-dan-${new Date().toISOString().slice(0, 10)}-${pastedCounter}.${ext}`, { type: f.type });
    return { key: `p${Date.now()}${pastedCounter}`, file: named, note: '' };
  });
};

export const AttachmentPicker: React.FC<{
  project: any;
  value: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
}> = ({ project, value, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<any[] | null>(null);
  const supported = isLocalDocsSupported();

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list || []);
    const tooBig = files.filter((f) => f.size > MAX_DOC_BYTES);
    if (tooBig.length) alert(`Bỏ qua file lớn hơn ${formatBytes(MAX_DOC_BYTES)}: ${tooBig.map((f) => f.name).join(', ')}`);
    const ok = files.filter((f) => f.size <= MAX_DOC_BYTES).map((f, i) => ({ key: `f${Date.now()}${i}`, file: f, note: '' }));
    if (value.length + ok.length > 10) alert('Tối đa 10 file đính kèm mỗi lần.');
    onChange([...value, ...ok].slice(0, 10));
  };

  const openLibrary = async () => {
    setLibraryOpen(!libraryOpen);
    if (library === null) {
      try {
        const docs = await api.get(`/api/task-projects/${project.id}/documents`, { noCache: true });
        setLibrary(Array.isArray(docs) ? docs : []);
      } catch {
        setLibrary([]);
      }
    }
  };

  if (!supported) {
    return <p className="tw-warning" style={{ color: 'var(--text-muted)' }}><CircleAlert size={14} /> Đính kèm tài liệu cần Chrome hoặc Edge (trình duyệt này không ghi được vào thư mục trên máy).</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 align-center" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}><Paperclip size={13} /> Đính kèm file</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={openLibrary}><Library size={13} /> Từ thư viện project</button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>hoặc dán ảnh (⌘/Ctrl + V) vào ô mô tả</span>
        <input ref={input} type="file" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {libraryOpen && (
        <div className="tw-attach-library">
          {library === null && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {library?.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Thư viện trống.</span>}
          {library?.map((doc) => {
            const picked = value.some((v) => v.document?.id === doc.id);
            return (
              <label key={doc.id} className="flex align-center gap-2" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={picked || doc.alwaysInclude}
                  disabled={doc.alwaysInclude}
                  onChange={() => onChange(picked ? value.filter((v) => v.document?.id !== doc.id) : [...value, { key: doc.id, document: doc, note: '' }])}
                />
                {doc.name}
                {doc.alwaysInclude && <span className="badge">luôn gửi kèm</span>}
              </label>
            );
          })}
        </div>
      )}

      {value.map((item) => (
        <div key={item.key} className="tw-attach-row">
          <Thumb doc={item.document} file={item.file} docsFolder={project.docsFolder} />
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.file?.name || item.document?.name}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {formatBytes(item.file?.size ?? item.document?.size ?? 0)}{item.document ? ' · thư viện' : ''}</span>
            </div>
            <input
              className="form-input"
              style={{ width: '100%', padding: '3px 6px', fontSize: '0.75rem', marginTop: 2 }}
              placeholder="Ghi chú cho Claude về file này (tùy chọn)"
              value={item.note}
              onChange={(e) => onChange(value.map((v) => (v.key === item.key ? { ...v, note: e.target.value } : v)))}
            />
          </div>
          <button type="button" className="icon-btn" onClick={() => onChange(value.filter((v) => v.key !== item.key))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
};

/** Writes new files (into plans/<date>-<slug>) and returns the `attachments` payload for the API. */
export const submitAttachments = async (project: any, items: PendingAttachment[], planTitle: string) => {
  const newFiles = items.filter((i) => i.file);
  let uploaded: any[] = [];
  if (newFiles.length) {
    const folder = `${new Date().toISOString().slice(0, 10)}-${slugify(planTitle)}`;
    uploaded = (await uploadDocuments(project, newFiles.map((i) => ({ file: i.file as File, note: i.note })), ['plans', folder])).created;
  }
  return [
    ...items.filter((i) => i.document).map((i) => ({ documentId: i.document.id, ...(i.note ? { note: i.note } : {}) })),
    ...uploaded.map((u) => ({ documentId: u.document.id, ...(u.note ? { note: u.note } : {}) }))
  ];
};

// ---------- attachment list (plan detail) ----------

export const AttachmentList: React.FC<{ project: any; attachments: any[] }> = ({ project, attachments }) => {
  if (!attachments?.length) return null;
  return (
    <div className="tw-attach-grid">
      {attachments.map((a) => (
        <button key={a.id} type="button" className="tw-attach-card" onClick={() => openLocal(project.docsFolder, a.document)} title={a.document?.relativePath}>
          <Thumb doc={a.document} docsFolder={project.docsFolder} />
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.document?.name}</span>
            <span style={{ display: 'block', fontSize: '0.7rem', color: a.document?.missing ? 'var(--danger)' : 'var(--text-muted)' }}>
              {a.document?.missing ? 'Không còn trên máy' : a.note || (a.source === 'FEEDBACK' ? 'Kèm góp ý' : formatBytes(a.document?.size ?? 0))}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
};

// ---------- project library ----------

export const ProjectDocsModal: React.FC<{ project: any; onClose: () => void; onProjectChanged: () => void }> = ({ project, onClose, onProjectChanged }) => {
  const [docs, setDocs] = useState<any[] | null>(null);
  const [includePlan, setIncludePlan] = useState(false);
  const [docsFolder, setDocsFolder] = useState<string | null>(project.docsFolder ?? null);
  const input = useRef<HTMLInputElement>(null);
  const { busy, run } = useBusy();

  const load = useCallback(async () => {
    try {
      const list = await api.get(`/api/task-projects/${project.id}/documents${includePlan ? '?includePlan=true' : ''}`, { noCache: true });
      setDocs(Array.isArray(list) ? list : []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được tài liệu'));
      setDocs([]);
    }
  }, [project.id, includePlan]);

  useEffect(() => { load(); }, [load]);

  const upload = (files: FileList | null) => run('upload', async () => {
    const list = Array.from(files || []).filter((f) => f.size <= MAX_DOC_BYTES);
    if (!list.length) return;
    try {
      const { docsFolder: folder } = await uploadDocuments({ ...project, docsFolder }, list.map((file) => ({ file })), [], true);
      if (folder !== docsFolder) { setDocsFolder(folder); onProjectChanged(); }
      await load();
    } catch (err: any) {
      alert(err?.message || 'Tải tài liệu thất bại');
    }
  });

  const remove = (doc: any) => run(`del-${doc.id}`, async () => {
    const alsoLocal = window.confirm(`Xóa “${doc.name}” khỏi thư viện.\n\nBấm OK để xóa luôn file trên máy, Cancel để chỉ gỡ khỏi VDEV.`);
    try {
      await api.delete(`/api/task-projects/${project.id}/documents/${doc.id}`);
      if (alsoLocal && docsFolder) {
        const root = await getDocsRoot(true);
        if (root) await removeDocument(root, docsFolder, doc.relativePath).catch(() => undefined);
      }
      await load();
    } catch (err) {
      alert(getErrorMessage(err, 'Xóa tài liệu thất bại'));
    }
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Tài liệu của project</h3>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-4">
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            File nằm trên máy này, trong thư mục <code>{docsFolder ? `…/${docsFolder}` : `(tạo khi tải lần đầu: “${project.name}”)`}</code>.
            Tài liệu bật <b>luôn gửi kèm</b> được Claude đọc ở mọi kế hoạch của project.
          </p>
          {!isLocalDocsSupported() && <p className="tw-warning"><CircleAlert size={14} /> Cần Chrome hoặc Edge để thêm tài liệu.</p>}
          <div className="flex gap-2 align-center">
            <button className="btn btn-primary btn-sm" disabled={busy !== null || !isLocalDocsSupported()} onClick={() => input.current?.click()}>
              <Upload size={13} /> {busy === 'upload' ? 'Đang lưu...' : 'Thêm tài liệu'}
            </button>
            <input ref={input} type="file" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            <label className="flex align-center gap-2" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
              <input type="checkbox" checked={includePlan} onChange={(e) => setIncludePlan(e.target.checked)} /> Hiện cả file đính kèm kế hoạch
            </label>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            {docs === null && <div className="loading-container" style={{ padding: 16 }}><span className="spinner"></span></div>}
            {docs?.length === 0 && <div style={{ padding: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có tài liệu.</div>}
            {docs?.map((doc) => (
              <div key={doc.id} className="tw-attach-row" style={{ borderBottom: '1px solid var(--border-color)', borderRadius: 0, padding: '8px 10px' }}>
                <Thumb doc={doc} docsFolder={docsFolder} />
                <button className="icon-btn" style={{ flexGrow: 1, minWidth: 0, justifyContent: 'flex-start', color: 'var(--text-main)' }} onClick={() => openLocal(docsFolder, doc)}>
                  <span style={{ textAlign: 'left', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.relativePath}</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: doc.missing ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {doc.missing ? 'Không còn trên máy' : formatBytes(doc.size)}
                    </span>
                  </span>
                </button>
                <label className="flex align-center gap-2" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={!!doc.alwaysInclude}
                    disabled={busy !== null}
                    onChange={(e) => run(`inc-${doc.id}`, async () => {
                      try {
                        await api.patch(`/api/task-projects/${project.id}/documents/${doc.id}`, { alwaysInclude: e.target.checked });
                        await load();
                      } catch (err) {
                        alert(getErrorMessage(err, 'Cập nhật thất bại'));
                      }
                    })}
                  />
                  Luôn gửi kèm
                </label>
                <button className="icon-btn danger" disabled={busy !== null} onClick={() => remove(doc)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- root folder settings (Máy chạy Claude modal) ----------

const ROOT_STATUS: Record<string, { label: string; color: string; icon: React.FC<{ size?: number }> }> = {
  OK: { label: 'Máy chạy đã xác nhận', color: 'var(--success)', icon: CircleCheck },
  INVALID: { label: 'Máy chạy không tìm thấy', color: 'var(--danger)', icon: CircleAlert },
  UNKNOWN: { label: 'Chưa kiểm tra', color: 'var(--text-muted)', icon: CircleHelp }
};

export const DocsRootSection: React.FC = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<any | null>(null);
  const [path, setPath] = useState('');
  const [browserFolder, setBrowserFolder] = useState<{ name: string; granted: boolean } | null>(null);
  const { busy, run } = useBusy();

  const refreshBrowser = useCallback(async () => {
    const stored = await getStoredRoot();
    if (!stored) return setBrowserFolder(null);
    const granted = (await stored.queryPermission({ mode: 'readwrite' })) === 'granted';
    setBrowserFolder({ name: stored.name, granted });
  }, []);

  useEffect(() => {
    loadAgentSettings().then((s) => { setSettings(s || {}); setPath(s?.docsRoot || ''); });
    if (isLocalDocsSupported()) refreshBrowser();
  }, [refreshBrowser]);

  const absolute = /^(\/|[A-Za-z]:[\\/])/.test(path.trim());
  const mismatch = browserFolder && path.trim() && basename(path.trim()) !== browserFolder.name;

  const save = () => run('save', async () => {
    try {
      const next = await api.patch('/api/agent/settings', { docsRoot: path.trim() || null });
      setSettings(next);
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu thư mục tài liệu thất bại'));
    }
  });

  const pick = () => run('pick', async () => {
    try {
      await pickDocsRoot(user?.id || 'unknown');
      await refreshBrowser();
    } catch (err: any) {
      if (err?.name !== 'AbortError') alert(err?.message || 'Không chọn được thư mục');
    }
  });

  const status = ROOT_STATUS[settings?.docsRootStatus] || ROOT_STATUS.UNKNOWN;
  const StatusIcon = status.icon;

  return (
    <div className="flex flex-col gap-2" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      <b style={{ fontSize: '0.875rem' }}>Thư mục tài liệu</b>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        File đính kèm cho Claude được lưu tại đây, mỗi project một thư mục con theo tên project. Không upload lên server. Nên đặt ngoài repo code.
      </span>
      <div className="flex gap-2">
        <input
          className={`form-input ${path.trim() && !absolute ? 'form-input-error' : ''}`}
          style={{ flexGrow: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
          placeholder="/Users/ban/VDEV Docs"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
        />
        <button className="btn btn-secondary" disabled={busy !== null || (!!path.trim() && !absolute) || path.trim() === (settings?.docsRoot || '')} onClick={save}>
          {busy === 'save' ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
      {settings?.docsRoot && (
        <span className="flex align-center gap-2" style={{ fontSize: '0.75rem', color: status.color }}>
          <StatusIcon size={13} /> {status.label}{settings.docsRootMessage ? ` · ${settings.docsRootMessage}` : ''}
        </span>
      )}
      {isLocalDocsSupported() ? (
        <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={pick}>
            <FolderOpen size={13} /> {browserFolder ? 'Chọn lại thư mục trên trình duyệt' : 'Chọn thư mục trên trình duyệt'}
          </button>
          <span style={{ fontSize: '0.75rem', color: browserFolder?.granted ? 'var(--success)' : 'var(--text-muted)' }}>
            {browserFolder ? `Đã chọn “${browserFolder.name}”${browserFolder.granted ? '' : ' — trình duyệt sẽ hỏi lại quyền khi tải file'}` : 'Trình duyệt chưa được chọn thư mục'}
          </span>
          {mismatch && <span className="form-error-text" style={{ width: '100%' }}>Thư mục đã chọn (“{browserFolder?.name}”) khác tên với đường dẫn ở trên — hãy chọn đúng thư mục.</span>}
        </div>
      ) : (
        <span className="tw-warning"><CircleAlert size={14} /> Trình duyệt này không hỗ trợ ghi vào thư mục trên máy. Dùng Chrome hoặc Edge.</span>
      )}
    </div>
  );
};
