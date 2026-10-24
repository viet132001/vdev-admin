import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { Check, RotateCcw, CircleCheck, CircleX, CircleAlert, MessageSquarePlus, ChevronDown, ChevronRight, FileCode2, FlaskConical, Undo2, X } from 'lucide-react';
import { NOTE_STATUS, formatRelative, isNoteOpen, noteStatus, useBusy } from './agent';
import { RollbackDialog, type ConfirmState } from './shared';
import { Markdown } from './PlanPanel';
import { getDocsRoot, isLocalDocsSupported, readDocument } from './localDocs';

interface TaskReviewProps {
  task: any;
  onChanged: () => void; // reload task detail + views
  onConfirm: (state: ConfirmState) => void;
}

type DiffLine = { kind: 'hunk' | 'add' | 'del' | 'ctx'; text: string; oldNo?: number; newNo?: number };

// Unified diff -> lines with old / new line numbers
export const parsePatch = (patch: string): DiffLine[] => {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  patch.split('\n').forEach((raw) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      lines.push({ kind: 'hunk', text: raw });
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1), newNo: newNo++ });
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++ });
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file"
    } else if (lines.length > 0) {
      lines.push({ kind: 'ctx', text: raw.startsWith(' ') ? raw.slice(1) : raw, oldNo: oldNo++, newNo: newNo++ });
    }
  });
  return lines;
};

// Pairs removed / added runs side by side for the split view
const toSplitRows = (lines: DiffLine[]) => {
  const rows: { left?: DiffLine; right?: DiffLine; hunk?: DiffLine }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === 'hunk') { rows.push({ hunk: line }); i++; continue; }
    if (line.kind === 'ctx') { rows.push({ left: line, right: line }); i++; continue; }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === 'del') dels.push(lines[i++]);
    while (i < lines.length && lines[i].kind === 'add') adds.push(lines[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] });
  }
  return rows;
};

const lineKey = (side: 'OLD' | 'NEW', line: number) => `${side}:${line}`;
const anchorOf = (line: DiffLine): { side: 'OLD' | 'NEW'; line: number } | null =>
  line.kind === 'del' ? { side: 'OLD', line: line.oldNo! } : line.kind === 'hunk' ? null : { side: 'NEW', line: line.newNo! };

const FILE_STATUS: Record<string, string> = { A: 'Thêm', M: 'Sửa', D: 'Xóa', R: 'Đổi tên' };

// ---------- before / after screenshots (files in the docs folder on the runner's machine) ----------

const LocalShot: React.FC<{ root: any; path?: string; label: string }> = ({ root, path, label }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!root || !path) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const [folder, ...rest] = path.split('/');
    readDocument(root, folder, rest.join('/'))
      .then((file) => { if (!cancelled) { objectUrl = URL.createObjectURL(file); setUrl(objectUrl); } })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [root, path]);
  return (
    <figure className="tw-shot">
      <figcaption>{label}</figcaption>
      {!path ? <div className="tw-shot-empty">Không có ảnh</div>
        : url ? <a href={url} target="_blank" rel="noopener noreferrer" title="Mở ảnh đầy đủ"><img src={url} alt={label} /></a>
        : <div className="tw-shot-empty">{missing ? 'Không tìm thấy file trên máy này' : root ? 'Đang tải…' : ''}</div>}
    </figure>
  );
};

const ScreenshotReport: React.FC<{ shots: any[] }> = ({ shots }) => {
  // undefined: still checking, null: no folder / no permission on this browser
  const [root, setRoot] = useState<any | null | undefined>(undefined);
  useEffect(() => { getDocsRoot(false).then(setRoot).catch(() => setRoot(null)); }, []);
  const grant = async () => setRoot(await getDocsRoot(true).catch(() => null));
  return (
    <div className="tw-selfreview">
      <div className="tw-label">Ảnh chụp màn hình · trước → sau</div>
      {root === null && (
        <div className="tw-warning" style={{ color: 'var(--text-muted)' }}>
          <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Ảnh nằm trong thư mục tài liệu trên máy chạy.{' '}
            {isLocalDocsSupported()
              ? <button className="icon-btn" style={{ padding: 0, textDecoration: 'underline', fontSize: 'inherit' }} onClick={grant}>Cấp quyền đọc thư mục tài liệu</button>
              : 'Mở bằng Chrome / Edge trên máy chạy để xem.'}
          </span>
        </div>
      )}
      {shots.map((shot) => (
        <div key={shot.name} className="flex flex-col gap-2" style={{ marginTop: 6 }}>
          <div style={{ fontSize: '0.82rem' }}><b>{shot.name}</b> <code style={{ color: 'var(--text-muted)' }}>{shot.path}</code></div>
          {shot.error && <div style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>{shot.error}</div>}
          <div className="tw-shot-pair">
            <LocalShot root={root} path={shot.before} label="Trước" />
            <LocalShot root={root} path={shot.after} label="Sau" />
          </div>
        </div>
      ))}
    </div>
  );
};

const NoteBadge: React.FC<{ note: any }> = ({ note }) => {
  const meta = NOTE_STATUS[noteStatus(note)];
  return <span className="badge" style={{ color: meta.color }}>{meta.label}</span>;
};

export const TaskReview: React.FC<TaskReviewProps> = ({ task, onChanged, onConfirm }) => {
  const [changeSets, setChangeSets] = useState<any[] | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, any>>({});
  const [mode, setMode] = useState<'unified' | 'split'>(() => (localStorage.getItem('tw_diff_mode') === 'split' ? 'split' : 'unified'));
  const [notes, setNotes] = useState<any[]>([]);
  const [composer, setComposer] = useState<{ side: 'OLD' | 'NEW'; line: number; body: string } | null>(null);
  const [generalNote, setGeneralNote] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkNote, setReworkNote] = useState('');
  const [showChecks, setShowChecks] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const { busy, run } = useBusy();

  const loadChangeSets = useCallback(async () => {
    try {
      const list = await api.get(`/api/tasks/${task.id}/changesets`, { noCache: true });
      const sets = Array.isArray(list) ? list : [];
      setChangeSets(sets);
      setRevisionId((current) => (current && sets.some((s: any) => s.id === current) ? current : sets[0]?.id ?? null));
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được thay đổi code'));
      setChangeSets([]);
    }
  }, [task.id]);

  const loadNotes = useCallback(async () => {
    try {
      const list = await api.get(`/api/tasks/${task.id}/review-notes`, { noCache: true });
      setNotes(Array.isArray(list) ? list : []);
    } catch {
      setNotes([]);
    }
  }, [task.id]);

  useEffect(() => { loadChangeSets(); loadNotes(); }, [loadChangeSets, loadNotes, task.status]);

  const changeSet = changeSets?.find((c) => c.id === revisionId) || null;

  useEffect(() => {
    setFilePath((current) => (changeSet?.files.some((f: any) => f.path === current) ? current : changeSet?.files[0]?.path ?? null));
    setComposer(null);
  }, [changeSet]);

  const patchKey = changeSet && filePath ? `${changeSet.id}::${filePath}` : null;
  useEffect(() => {
    if (!patchKey || patches[patchKey] || !changeSet || !filePath) return;
    api.get(`/api/changesets/${changeSet.id}/files?path=${encodeURIComponent(filePath)}`, { noCache: true })
      .then((file) => setPatches((prev) => ({ ...prev, [patchKey]: file })))
      .catch((err) => alert(getErrorMessage(err, 'Không tải được diff của file')));
  }, [patchKey, patches, changeSet, filePath]);

  const file = patchKey ? patches[patchKey] : null;
  const lines = useMemo(() => (file?.patch ? parsePatch(file.patch) : []), [file]);

  // Line notes of the file being viewed, in the selected revision
  const lineNotes = useMemo(() => {
    const map: Record<string, any[]> = {};
    notes
      .filter((n) => n.changeSetId === changeSet?.id && n.filePath === filePath && n.line)
      .forEach((n) => { (map[lineKey(n.side || 'NEW', n.line)] ||= []).push(n); });
    return map;
  }, [notes, changeSet, filePath]);

  const openNotes = notes.filter(isNoteOpen);
  const supportsThreads = notes.some((n) => Array.isArray(n.replies) || 'status' in n);
  const isAgentTask = task.assignee === 'AGENT';
  const inReview = task.status === 'IN_REVIEW';
  const testing = task.status === 'TESTING';
  // Chờ test can be reviewed too: the user may test by hand, then Done or send back
  const reviewable = inReview || testing;
  const untested: string | undefined = changeSets?.[0]?.selfReview?.untested;

  const setDiffMode = (next: 'unified' | 'split') => {
    setMode(next);
    try { localStorage.setItem('tw_diff_mode', next); } catch { /* per-viewer preference only */ }
  };

  const addNote = (payload: any, onDone: () => void) => run('note', async () => {
    try {
      await api.post(`/api/tasks/${task.id}/review-notes`, payload);
      onDone();
      await loadNotes();
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu góp ý thất bại'));
    }
  });

  const noteAction = (key: string, fn: () => Promise<any>, fallback: string) => run(key, async () => {
    try {
      await fn();
      await loadNotes();
    } catch (err) {
      alert(getErrorMessage(err, fallback));
    }
  });

  const accept = () => {
    const doAccept = () => run('accept', async () => {
      try {
        await api.post(`/api/tasks/${task.id}/accept`, {});
        onChanged();
      } catch (err) {
        alert(getErrorMessage(err, 'Đánh dấu Done thất bại'));
      }
    });
    if (openNotes.length === 0) return doAccept();
    onConfirm({
      title: 'Còn góp ý chưa xử lý',
      message: `Task còn ${openNotes.length} góp ý đang mở. Đánh dấu Done sẽ đóng toàn bộ góp ý.`,
      confirmLabel: 'Vẫn Done',
      action: async () => { await doAccept(); }
    });
  };

  const requestRework = () => run('rework', async () => {
    try {
      await api.post(`/api/tasks/${task.id}/request-rework`, { note: reworkNote.trim() });
      setReworkOpen(false);
      setReworkNote('');
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Gửi yêu cầu làm lại thất bại'));
    }
  });

  const retest = () => run('retest', async () => {
    try {
      await api.post(`/api/tasks/${task.id}/retest`, {});
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Không xếp được lượt chạy test'));
    }
  });

  const rollback = async (then: 'PENDING' | 'CANCELLED') => {
    try {
      await api.post(`/api/tasks/${task.id}/rollback`, { then });
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Không xếp được lượt rollback'));
    }
  };

  const renderComposer = (anchor: { side: 'OLD' | 'NEW'; line: number }) =>
    composer && composer.side === anchor.side && composer.line === anchor.line ? (
      <div className="tw-diff-composer">
        <textarea
          autoFocus
          className="form-input"
          rows={2}
          placeholder={`Góp ý cho dòng ${anchor.line}…`}
          value={composer.body}
          onChange={(e) => setComposer({ ...composer, body: e.target.value })}
        />
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setComposer(null)}>Hủy</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy !== null || !composer.body.trim()}
            onClick={() => addNote({ body: composer.body.trim(), changeSetId: changeSet.id, filePath, line: anchor.line, side: anchor.side }, () => setComposer(null))}
          >
            {busy === 'note' ? 'Đang lưu...' : 'Thêm góp ý'}
          </button>
        </div>
      </div>
    ) : null;

  const renderLineNotes = (anchor: { side: 'OLD' | 'NEW'; line: number } | null) => {
    if (!anchor) return null;
    const list = lineNotes[lineKey(anchor.side, anchor.line)];
    return (
      <>
        {list?.map((n) => (
          <div key={n.id} className="tw-diff-note">
            <div className="flex align-center gap-2"><NoteBadge note={n} /><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{formatRelative(n.createdAt)}</span></div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
          </div>
        ))}
        {renderComposer(anchor)}
      </>
    );
  };

  const lineNumberCell = (line: DiffLine | undefined, no: number | undefined) => {
    const anchor = line ? anchorOf(line) : null;
    return (
      <td className="tw-diff-no">
        {no ?? ''}
        {anchor && changeSet && (
          <button className="tw-diff-add-note" title="Góp ý dòng này" onClick={() => setComposer({ ...anchor, body: '' })}>+</button>
        )}
      </td>
    );
  };

  if (changeSets === null) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải thay đổi…</span></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {isAgentTask && (
        <div className={`tw-review-bar ${reviewable ? 'ready' : ''}`}>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <b style={{ fontSize: '0.875rem' }}>
              {inReview ? 'Claude đã xong · chờ bạn review' : testing ? 'Code xong nhưng chưa test được · chờ test' : task.status === 'COMPLETED' ? 'Đã Done' : task.status === 'IN_PROGRESS' ? 'Claude đang làm task này' : task.status === 'CANCELLED' ? 'Đã hủy' : 'Đang chờ Claude làm'}
            </b>
            {testing && untested && <div className="flex gap-2" style={{ fontSize: '0.78rem', color: 'var(--warning)', alignItems: 'flex-start', whiteSpace: 'pre-wrap' }}><CircleAlert size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {untested}</div>}
            {testing && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Bật lại môi trường (Docker / DB…) rồi bấm Chạy test lại. Task phụ thuộc task này sẽ chờ tới khi test qua.</div>}
            {reviewable && openNotes.length > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{openNotes.length} góp ý đang mở sẽ được gửi cho Claude khi yêu cầu làm lại</div>}
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {changeSets.length > 0 && task.status !== 'IN_PROGRESS' && (
              <button className="btn btn-secondary" disabled={busy !== null} onClick={() => setRollbackOpen(true)} title="Trả các file task đã sửa về như trước khi Claude làm">
                <Undo2 size={14} /> Rollback
              </button>
            )}
            {testing && (
              <button className="btn btn-secondary" disabled={busy !== null} onClick={retest}>
                <FlaskConical size={14} /> {busy === 'retest' ? 'Đang gửi...' : 'Chạy test lại'}
              </button>
            )}
            {reviewable && (
              <>
                <button className="btn btn-secondary" disabled={busy !== null} onClick={() => { setReworkNote(''); setReworkOpen(true); }}>
                  <RotateCcw size={14} /> Ghi chú & làm lại
                </button>
                <button className="btn btn-primary" disabled={busy !== null} onClick={accept} title={testing ? 'Bạn đã tự test và chấp nhận' : undefined}>
                  <Check size={14} /> {busy === 'accept' ? 'Đang lưu...' : testing ? 'Done (đã tự test)' : 'Done'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {rollbackOpen && <RollbackDialog scope="task" onClose={() => setRollbackOpen(false)} onSubmit={rollback} />}

      {changeSets.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          <FileCode2 className="empty-state-icon" size={26} />
          <p>Chưa có thay đổi code nào. Khi Claude làm xong task, diff sẽ hiện ở đây.</p>
        </div>
      ) : changeSet && (
        <>
          <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
            <select className="form-input" style={{ padding: '6px 10px', fontSize: '0.82rem' }} value={changeSet.id} onChange={(e) => setRevisionId(e.target.value)}>
              {changeSets.map((cs) => (
                <option key={cs.id} value={cs.id}>Revision {cs.revision} · {formatRelative(cs.createdAt)} · +{cs.stats?.additions ?? 0} −{cs.stats?.deletions ?? 0}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{changeSet.stats?.files ?? changeSet.files.length} file</span>
            <span style={{ flexGrow: 1 }} />
            <div className="tw-segmented">
              <button className={mode === 'unified' ? 'active' : ''} onClick={() => setDiffMode('unified')}>Gộp</button>
              <button className={mode === 'split' ? 'active' : ''} onClick={() => setDiffMode('split')}>Chia đôi</button>
            </div>
          </div>

          {changeSet.summary && <div className="tw-review-summary"><Markdown text={changeSet.summary} /></div>}

          {changeSet.selfReview && (
            <div className="tw-selfreview">
              <div className="tw-label">Claude tự kiểm tra</div>
              {(changeSet.selfReview.criteria || []).map((c: any, i: number) => (
                <div key={i} className="flex gap-2" style={{ fontSize: '0.82rem', alignItems: 'flex-start' }}>
                  {c.met ? <CircleCheck size={14} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> : <CircleX size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />}
                  <span>{c.text}{c.evidence && <span style={{ color: 'var(--text-muted)' }}> — {c.evidence}</span>}</span>
                </div>
              ))}
              {(changeSet.selfReview.checks || []).length > 0 && (
                <>
                  <button className="icon-btn" style={{ fontSize: '0.78rem', padding: '2px 0', alignSelf: 'flex-start' }} onClick={() => setShowChecks(!showChecks)}>
                    {showChecks ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Lệnh kiểm tra: {changeSet.selfReview.checks.map((ch: any) => `${ch.name} ${ch.passed ? '✓' : ch.notRun ? '— chưa chạy' : '✗'}`).join(' · ')}
                  </button>
                  {showChecks && changeSet.selfReview.checks.map((ch: any, i: number) => (
                    <div key={i}>
                      <div style={{ fontSize: '0.78rem', color: ch.passed ? 'var(--success)' : ch.notRun ? 'var(--warning)' : 'var(--danger)' }}><code>{ch.command}</code> — {ch.passed ? 'pass' : ch.notRun ? 'chưa chạy được (môi trường)' : 'fail'}</div>
                      {ch.output && <pre className="tw-code-block">{ch.output}</pre>}
                    </div>
                  ))}
                </>
              )}
              {changeSet.selfReview.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ghi chú: {changeSet.selfReview.notes}</div>}
            </div>
          )}

          {changeSet.selfReview?.screenshots?.length > 0 && <ScreenshotReport key={changeSet.id} shots={changeSet.selfReview.screenshots} />}

          <div className="tw-diff-shell">
            <div className="tw-diff-files">
              {changeSet.files.map((f: any) => (
                <button key={f.path} className={`tw-diff-file ${f.path === filePath ? 'active' : ''}`} onClick={() => setFilePath(f.path)} title={f.path}>
                  <span className={`tw-file-status s-${f.status}`}>{f.status}</span>
                  <span className="tw-diff-file-name">{f.path.split('/').pop()}</span>
                  <span className="tw-diff-file-dir">{f.path.split('/').slice(0, -1).join('/')}</span>
                  <span className="tw-diff-stat"><span className="plus">+{f.additions}</span> <span className="minus">−{f.deletions}</span></span>
                </button>
              ))}
            </div>
            <div className="tw-diff-view">
              {filePath && (
                <div className="tw-diff-header">
                  <b>{filePath}</b>
                  {file?.oldPath && <span style={{ color: 'var(--text-muted)' }}> ← {file.oldPath}</span>}
                  <span className="badge" style={{ marginLeft: 8 }}>{FILE_STATUS[file?.status] || file?.status || ''}</span>
                </div>
              )}
              {!file && filePath && <div className="loading-container" style={{ padding: 16 }}><span className="spinner"></span></div>}
              {file?.isBinary && <div className="tw-diff-empty">File nhị phân — không hiển thị nội dung.</div>}
              {file && !file.isBinary && !file.patch && <div className="tw-diff-empty">Không có nội dung thay đổi để hiển thị.</div>}
              {file?.truncated && <div className="tw-diff-empty">Diff quá lớn nên đã bị cắt bớt.</div>}
              {file && !file.isBinary && file.patch && (
                <table className="tw-diff">
                  <tbody>
                    {mode === 'unified' ? lines.map((line, i) => (
                      <React.Fragment key={i}>
                        {line.kind === 'hunk' ? (
                          <tr className="hunk"><td colSpan={3}>{line.text}</td></tr>
                        ) : (
                          <tr className={line.kind}>
                            {lineNumberCell(line, line.oldNo)}
                            <td className="tw-diff-no">{line.newNo ?? ''}</td>
                            <td className="tw-diff-code"><span className="tw-diff-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span>{line.text}</td>
                          </tr>
                        )}
                        {(() => {
                          const anchor = anchorOf(line);
                          const extra = renderLineNotes(anchor);
                          return anchor && (lineNotes[lineKey(anchor.side, anchor.line)] || (composer && composer.side === anchor.side && composer.line === anchor.line))
                            ? <tr><td colSpan={3}>{extra}</td></tr> : null;
                        })()}
                      </React.Fragment>
                    )) : toSplitRows(lines).map((row, i) => (
                      <React.Fragment key={i}>
                        {row.hunk ? (
                          <tr className="hunk"><td colSpan={4}>{row.hunk.text}</td></tr>
                        ) : (
                          <tr>
                            {lineNumberCell(row.left, row.left?.oldNo)}
                            <td className={`tw-diff-code ${row.left?.kind === 'del' ? 'del' : row.left ? '' : 'empty'}`}>{row.left?.text ?? ''}</td>
                            {lineNumberCell(row.right?.kind === 'ctx' ? undefined : row.right, row.right?.newNo)}
                            <td className={`tw-diff-code ${row.right?.kind === 'add' ? 'add' : row.right ? '' : 'empty'}`}>{row.right?.text ?? ''}</td>
                          </tr>
                        )}
                        {[row.left && anchorOf(row.left), row.right && row.right.kind === 'add' ? anchorOf(row.right) : null].map((anchor, k) =>
                          anchor && (lineNotes[lineKey(anchor.side, anchor.line)] || (composer && composer.side === anchor.side && composer.line === anchor.line))
                            ? <tr key={k}><td colSpan={4}>{renderLineNotes(anchor)}</td></tr> : null
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* All review notes */}
      <div>
        <div className="tw-label">Góp ý ({openNotes.length} đang mở / {notes.length})</div>
        <div className="flex flex-col gap-2">
          {notes.map((n) => {
            const status = noteStatus(n);
            const revision = changeSets.find((cs) => cs.id === n.changeSetId)?.revision;
            return (
              <div key={n.id} className="tw-note">
                <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <NoteBadge note={n} />
                  {n.filePath ? (
                    <button className="icon-btn" style={{ fontSize: '0.75rem', padding: 0, fontFamily: 'var(--font-mono)' }} onClick={() => { if (n.changeSetId) setRevisionId(n.changeSetId); setFilePath(n.filePath); }}>
                      {n.filePath}{n.line ? `:${n.line}` : ''}{revision ? ` · rev ${revision}` : ''}
                    </button>
                  ) : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Góp ý chung</span>}
                  {(n.addressedInRevision || n.resolvedInRevision) && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>xử lý ở rev {n.addressedInRevision || n.resolvedInRevision}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatRelative(n.createdAt)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', marginTop: 4 }}>{n.body}</div>
                {Array.isArray(n.replies) && n.replies.length > 0 && (
                  <div className="tw-note-thread">
                    {n.replies.map((r: any) => (
                      <div key={r.id} style={{ fontSize: '0.82rem' }}>
                        <b>{r.authorType === 'AGENT' ? 'Claude' : 'Bạn'}</b>
                        {r.revision ? <span style={{ color: 'var(--text-muted)' }}> · rev {r.revision}</span> : null}: <span style={{ whiteSpace: 'pre-wrap' }}>{r.body}</span>
                      </div>
                    ))}
                  </div>
                )}
                {supportsThreads && status !== 'OPEN' && (
                  <div className="flex gap-2" style={{ marginTop: 6 }}>
                    <input
                      className="form-input"
                      style={{ flexGrow: 1, padding: '5px 8px', fontSize: '0.8rem' }}
                      placeholder={status === 'RESOLVED' ? 'Mở lại bằng một góp ý thêm…' : 'Góp thêm…'}
                      value={replyDrafts[n.id] || ''}
                      onChange={(e) => setReplyDrafts({ ...replyDrafts, [n.id]: e.target.value })}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy !== null || !(replyDrafts[n.id] || '').trim()}
                      onClick={() => noteAction(`reply-${n.id}`, async () => {
                        await api.post(`/api/review-notes/${n.id}/replies`, { body: replyDrafts[n.id].trim() });
                        setReplyDrafts({ ...replyDrafts, [n.id]: '' });
                      }, 'Gửi góp ý thêm thất bại')}
                    >
                      {busy === `reply-${n.id}` ? 'Đang gửi...' : 'Góp thêm'}
                    </button>
                    {status === 'ADDRESSED' && (
                      <button className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => noteAction(`resolve-${n.id}`, () => api.patch(`/api/review-notes/${n.id}`, { status: 'RESOLVED' }), 'Đóng góp ý thất bại')}>
                        {busy === `resolve-${n.id}` ? 'Đang lưu...' : 'Đóng'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex gap-2">
            <textarea
              className="form-input"
              rows={1}
              style={{ flexGrow: 1, resize: 'vertical', minHeight: 38 }}
              placeholder="Thêm góp ý chung cho task…"
              value={generalNote}
              onChange={(e) => setGeneralNote(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              disabled={busy !== null || !generalNote.trim()}
              onClick={() => addNote({ body: generalNote.trim(), ...(changeSet ? { changeSetId: changeSet.id } : {}) }, () => setGeneralNote(''))}
            >
              <MessageSquarePlus size={14} /> {busy === 'note' ? 'Đang lưu...' : 'Thêm'}
            </button>
          </div>
        </div>
      </div>

      {reworkOpen && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Yêu cầu Claude làm lại</h3>
              <button className="hamburger-btn" onClick={() => setReworkOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {openNotes.length > 0 && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>{openNotes.length} góp ý đang mở sẽ được gửi kèm.</p>
              )}
              <label className="form-label">Ghi chú cho Claude</label>
              <textarea autoFocus className="form-input" rows={5} style={{ width: '100%', resize: 'vertical', marginTop: 6 }} value={reworkNote} onChange={(e) => setReworkNote(e.target.value)} placeholder="Cần sửa gì, vì sao…" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setReworkOpen(false)}>Hủy</button>
              <button className="btn btn-primary" disabled={busy !== null || !reworkNote.trim()} onClick={requestRework}>
                {busy === 'rework' ? 'Đang gửi...' : 'Gửi & làm lại'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
