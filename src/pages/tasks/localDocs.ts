// Local document folder (src/doc/task-agent-mcp.md section 13): files stay on this machine, the server only stores paths.
// Uses the File System Access API (Chrome / Edge). The root folder handle is remembered in IndexedDB per browser.

const DB_NAME = 'vdev-docs';
const STORE = 'handles';
const ROOT_KEY = 'docsRoot';
const ROOT_MARKER = '.vdev-docs.json';
const PROJECT_MARKER = '.vdev-project.json';
export const MAX_DOC_BYTES = 20 * 1024 * 1024;

type DirHandle = any; // FileSystemDirectoryHandle with permission methods (not in TS lib.dom yet)

export const isLocalDocsSupported = () => typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

// ---------- IndexedDB ----------

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idb = async <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
};

// ---------- names & paths ----------

// Characters not allowed in file / folder names on macOS or Windows, plus control characters
// oxlint-disable-next-line no-control-regex
const INVALID_CHARS = /[/\\:*?"<>|\u0000-\u001f]/g;

export const sanitizeFolderName = (name: string, fallbackId: string) => {
  const clean = (name || '').replace(INVALID_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim();
  return clean || `project-${fallbackId.slice(0, 6)}`;
};

export const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'tai-lieu';

/** "a.png" -> "a (2).png" */
export const withSuffix = (fileName: string, n: number) => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}` : `${fileName} (${n})`;
};

export const basename = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

// ---------- handles ----------

const exists = async (dir: DirHandle, name: string, kind: 'file' | 'directory') => {
  try {
    if (kind === 'file') await dir.getFileHandle(name);
    else await dir.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
};

const readJson = async (dir: DirHandle, name: string) => {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
};

const writeBlob = async (dir: DirHandle, name: string, data: Blob | string) => {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
};

/** Asks the user to pick the root folder (needs a click) and remembers it. */
export const pickDocsRoot = async (ownerId: string): Promise<DirHandle> => {
  const handle: DirHandle = await (window as any).showDirectoryPicker({ id: 'vdev-docs', mode: 'readwrite' });
  const marker = await readJson(handle, ROOT_MARKER);
  if (marker?.ownerId && marker.ownerId !== ownerId) {
    throw new Error('Thư mục này đang được tài khoản VDEV khác dùng làm thư mục tài liệu.');
  }
  if (!marker) await writeBlob(handle, ROOT_MARKER, JSON.stringify({ ownerId, version: 1 }, null, 2));
  await idb('readwrite', (s) => s.put(handle, ROOT_KEY));
  return handle;
};

export const forgetDocsRoot = () => idb('readwrite', (s) => s.delete(ROOT_KEY));

export const getStoredRoot = async (): Promise<DirHandle | null> => {
  try {
    return (await idb<DirHandle>('readonly', (s) => s.get(ROOT_KEY))) || null;
  } catch {
    return null;
  }
};

/**
 * The remembered root with read/write permission. Browsers drop the permission between sessions;
 * `request: true` re-asks the user and must run inside a click handler.
 */
export const getDocsRoot = async (request: boolean): Promise<DirHandle | null> => {
  const handle = await getStoredRoot();
  if (!handle) return null;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return handle;
  if (request && (await handle.requestPermission(opts)) === 'granted') return handle;
  return null;
};

/**
 * The project's folder under the root, named after the project and created on first use.
 * Existing folders are reused only when their marker belongs to this project (or they have no marker yet).
 */
export const ensureProjectFolder = async (root: DirHandle, project: { id: string; name: string; docsFolder?: string | null }, takenByOthers: string[]) => {
  if (project.docsFolder) {
    const dir = await root.getDirectoryHandle(project.docsFolder, { create: true });
    if (!(await exists(dir, PROJECT_MARKER, 'file'))) await writeBlob(dir, PROJECT_MARKER, JSON.stringify({ projectId: project.id }, null, 2));
    return { dir, folder: project.docsFolder, created: false };
  }
  const base = sanitizeFolderName(project.name, project.id);
  const taken = new Set(takenByOthers.map((f) => f.toLowerCase()));
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : withSuffix(base, n);
    if (taken.has(candidate.toLowerCase())) continue;
    if (await exists(root, candidate, 'directory')) {
      const dir = await root.getDirectoryHandle(candidate);
      const marker = await readJson(dir, PROJECT_MARKER);
      if (marker && marker.projectId !== project.id) continue;
      if (!marker) await writeBlob(dir, PROJECT_MARKER, JSON.stringify({ projectId: project.id }, null, 2));
      return { dir, folder: candidate, created: true };
    }
    const dir = await root.getDirectoryHandle(candidate, { create: true });
    await writeBlob(dir, PROJECT_MARKER, JSON.stringify({ projectId: project.id }, null, 2));
    return { dir, folder: candidate, created: true };
  }
  throw new Error('Không tạo được thư mục cho project.');
};

/** Writes the file under `subPath` without overwriting; returns the path relative to the project folder. */
export const writeDocument = async (projectDir: DirHandle, subPath: string[], file: File, name = file.name) => {
  let dir = projectDir;
  for (const part of subPath) dir = await dir.getDirectoryHandle(part, { create: true });
  const safe = name.replace(INVALID_CHARS, '-').trim() || 'file';
  let finalName = safe;
  for (let n = 2; await exists(dir, finalName, 'file'); n++) finalName = withSuffix(safe, n);
  await writeBlob(dir, finalName, file);
  return [...subPath, finalName].join('/');
};

const resolveFile = async (root: DirHandle, folder: string, relativePath: string) => {
  let dir = await root.getDirectoryHandle(folder);
  const parts = relativePath.split('/');
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  return { dir, name: parts[parts.length - 1] };
};

export const readDocument = async (root: DirHandle, folder: string, relativePath: string): Promise<File> => {
  const { dir, name } = await resolveFile(root, folder, relativePath);
  return (await dir.getFileHandle(name)).getFile();
};

export const removeDocument = async (root: DirHandle, folder: string, relativePath: string) => {
  const { dir, name } = await resolveFile(root, folder, relativePath);
  await dir.removeEntry(name);
};

export const sha256 = async (file: Blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const isImage = (mime: string | null | undefined) => !!mime && mime.startsWith('image/');

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
