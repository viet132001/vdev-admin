import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api';
import { Plus, Ellipsis, Pencil, Trash2, ArrowUp, ArrowDown, X, Headphones, ChevronRight, ChevronDown, PlayCircle, ListChecks, Upload } from 'lucide-react';
import { Practice } from './dictation/Practice';
import { SentenceManager } from './dictation/SentenceManager';
import { ImportSessions } from './dictation/ImportSessions';
import { ConfirmDialog, Popover, type ConfirmState } from './tasks/shared';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface SessionForm {
  id?: string;
  title: string;
  description: string;
  level: string;
}

interface LessonForm {
  id?: string;
  title: string;
  description: string;
}

const ProgressBar: React.FC<{ completed: number; total: number }> = ({ completed, total }) => (
  <div className="progress-bar-container" style={{ height: 6 }}>
    <div className="progress-bar-fill" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
  </div>
);

export const Dictation: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const lessonId = searchParams.get('lesson');
  const tab = searchParams.get('tab') === 'manage' ? 'manage' : 'practice';

  const [sessions, setSessions] = useState<any[] | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menuId, setMenuId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionForm | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonForm | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const go = useCallback((params: Record<string, string>) => setSearchParams(params), [setSearchParams]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.get('/api/dictation/sessions', { noCache: true });
      setSessions(Array.isArray(list) ? list : []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được danh sách session'));
      setSessions([]);
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    try {
      const detail = await api.get(`/api/dictation/sessions/${sessionId}`, { noCache: true });
      setSession(detail);
      setExpanded((prev) => ({ ...prev, [sessionId]: true }));
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được session'));
      go({});
    }
  }, [sessionId, go]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadSession(); }, [loadSession]);

  const refresh = useCallback(() => {
    loadSessions();
    loadSession();
  }, [loadSessions, loadSession]);

  const showConfirm = (title: string, message: string, action: () => Promise<void>) =>
    setConfirm({ title, message, confirmLabel: 'Xóa', action });

  // ---------- sessions ----------

  const saveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionForm?.title.trim()) return;
    const payload = { title: sessionForm.title.trim(), description: sessionForm.description.trim() || null, level: sessionForm.level };
    try {
      if (sessionForm.id) {
        await api.patch(`/api/dictation/sessions/${sessionForm.id}`, payload);
        refresh();
      } else {
        const created = await api.post('/api/dictation/sessions', payload);
        await loadSessions();
        go({ session: created.id });
      }
      setSessionForm(null);
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu session thất bại'));
    }
  };

  const moveSession = async (index: number, dir: -1 | 1) => {
    if (!sessions) return;
    const ids = sessions.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await api.patch('/api/dictation/sessions/reorder', { ids });
      await loadSessions();
    } catch (err) {
      alert(getErrorMessage(err, 'Sắp xếp thất bại'));
    }
  };

  const deleteSession = (s: any) =>
    showConfirm('Xóa session', `Xóa “${s.title}” cùng ${s.lessonCount} bài và ${s.sentenceCount} câu?`, async () => {
      try {
        await api.delete(`/api/dictation/sessions/${s.id}`);
        if (s.id === sessionId) go({});
        await loadSessions();
      } catch (err) {
        alert(getErrorMessage(err, 'Xóa session thất bại'));
      }
    });

  // ---------- lessons ----------

  const saveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonForm?.title.trim() || !sessionId) return;
    const payload = { title: lessonForm.title.trim(), description: lessonForm.description.trim() || null };
    try {
      if (lessonForm.id) {
        await api.patch(`/api/dictation/lessons/${lessonForm.id}`, payload);
        refresh();
      } else {
        const created = await api.post(`/api/dictation/sessions/${sessionId}/lessons`, payload);
        refresh();
        go({ session: sessionId, lesson: created.id, tab: 'manage' });
      }
      setLessonForm(null);
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu bài thất bại'));
    }
  };

  const moveLesson = async (index: number, dir: -1 | 1) => {
    const ids = session.lessons.map((l: any) => l.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await api.patch(`/api/dictation/sessions/${sessionId}/lessons/reorder`, { ids });
      refresh();
    } catch (err) {
      alert(getErrorMessage(err, 'Sắp xếp thất bại'));
    }
  };

  const deleteLesson = (l: any) =>
    showConfirm('Xóa bài', `Xóa bài “${l.title}” cùng ${l.sentenceCount} câu?`, async () => {
      try {
        await api.delete(`/api/dictation/lessons/${l.id}`);
        if (l.id === lessonId && sessionId) go({ session: sessionId });
        refresh();
      } catch (err) {
        alert(getErrorMessage(err, 'Xóa bài thất bại'));
      }
    });

  // ---------- render ----------

  const lessons: any[] = session?.id === sessionId ? session.lessons || [] : [];
  const lessonIndex = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessonIndex >= 0 ? lessons[lessonIndex] : null;
  const nextLesson = lessonIndex >= 0 ? lessons[lessonIndex + 1] || null : null;

  const lessonMenu = (l: any, index: number) => (
    <Popover onClose={() => setMenuId(null)} style={{ top: '100%', right: 0 }}>
      <button className="tw-popover-item" onClick={() => { setMenuId(null); setLessonForm({ id: l.id, title: l.title, description: l.description || '' }); }}><Pencil size={14} /> Sửa bài</button>
      <button className="tw-popover-item" disabled={index === 0} onClick={() => { setMenuId(null); moveLesson(index, -1); }}><ArrowUp size={14} /> Lên trên</button>
      <button className="tw-popover-item" disabled={index === lessons.length - 1} onClick={() => { setMenuId(null); moveLesson(index, 1); }}><ArrowDown size={14} /> Xuống dưới</button>
      <button className="tw-popover-item danger" onClick={() => { setMenuId(null); deleteLesson(l); }}><Trash2 size={14} /> Xóa bài</button>
    </Popover>
  );

  const renderMain = () => {
    if (!sessions) return <div className="loading-container"><span className="spinner"></span><span>Đang tải...</span></div>;

    if (!sessionId) {
      return (
        <div className="flex flex-col gap-4">
          <header className="flex justify-between align-center" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 600 }}>Luyện chính tả tiếng Anh</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nghe câu tiếng Anh, gõ lại, xem chỗ sai và nghĩa của câu.</p>
            </div>
            {sessions.length > 0 && (
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</button>
                <button className="btn btn-primary" onClick={() => setSessionForm({ title: '', description: '', level: 'A2' })}><Plus size={16} /> Tạo session</button>
              </div>
            )}
          </header>
          {sessions.length === 0 ? (
            <div className="empty-state">
              <Headphones className="empty-state-icon" size={32} />
              <p>Chưa có session nào.</p>
              <div className="flex gap-2 mt-4">
                <button className="btn btn-primary" onClick={() => setSessionForm({ title: '', description: '', level: 'A2' })}><Plus size={16} /> Tạo session</button>
                <button className="btn btn-secondary" onClick={() => setImportOpen(true)}><Upload size={16} /> Import từ file</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {sessions.map((s) => (
                <div key={s.id} className="card card-hover flex flex-col gap-2" style={{ cursor: 'pointer' }} onClick={() => go({ session: s.id })}>
                  <div className="flex justify-between align-center">
                    <b>{s.title}</b>
                    <span className="badge">{s.level}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minHeight: 20 }}>{s.description}</p>
                  <ProgressBar completed={s.progress.completed} total={s.progress.total} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.lessonCount} bài · {s.progress.completed}/{s.progress.total} câu đúng</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (!session || session.id !== sessionId) return <div className="loading-container"><span className="spinner"></span><span>Đang tải...</span></div>;

    if (!lessonId) {
      return (
        <div className="flex flex-col gap-4">
          <header className="flex justify-between align-center" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 600 }}>
                {session.title} <span className="badge" style={{ verticalAlign: 'middle' }}>{session.level}</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{session.description || `${session.lessonCount} bài · ${session.sentenceCount} câu`}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setSessionForm({ id: session.id, title: session.title, description: session.description || '', level: session.level })}><Pencil size={14} /> Sửa</button>
              <button className="btn btn-primary" onClick={() => setLessonForm({ title: '', description: '' })}><Plus size={16} /> Thêm bài</button>
            </div>
          </header>
          {lessons.length === 0 ? (
            <div className="empty-state"><p>Session chưa có bài nào.</p></div>
          ) : (
            <div className="flex flex-col gap-2">
              {lessons.map((l, i) => (
                <div key={l.id} className="card flex align-center gap-4" style={{ padding: 16 }}>
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <b>{i + 1}. {l.title}</b>
                    {l.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l.description}</div>}
                    <div className="flex align-center gap-2" style={{ marginTop: 8 }}>
                      <div style={{ width: 160 }}><ProgressBar completed={l.progress.completed} total={l.progress.total} /></div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {l.progress.completed}/{l.progress.total} câu{l.progress.averageAccuracy !== null && ` · ${l.progress.averageAccuracy}%`}
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => go({ session: sessionId, lesson: l.id, tab: 'manage' })}><ListChecks size={14} /> Câu</button>
                  <button className="btn btn-primary btn-sm" disabled={l.sentenceCount === 0} onClick={() => go({ session: sessionId, lesson: l.id })}><PlayCircle size={14} /> Luyện</button>
                  <div style={{ position: 'relative' }}>
                    <button className="icon-btn" onClick={() => setMenuId(menuId === l.id ? null : l.id)}><Ellipsis size={16} /></button>
                    {menuId === l.id && lessonMenu(l, i)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (!lesson) return <div className="empty-state"><p>Không tìm thấy bài.</p></div>;

    return (
      <div className="flex flex-col gap-4">
        <header className="flex justify-between align-center" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => go({ session: sessionId })}>
              {session.title} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />
            </div>
            <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>{lesson.title}</h1>
          </div>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setMenuId(menuId === lesson.id ? null : lesson.id)}><Ellipsis size={18} /></button>
            {menuId === lesson.id && lessonMenu(lesson, lessonIndex)}
          </div>
        </header>
        <div className="tabs">
          <button className={`tab ${tab === 'practice' ? 'active' : ''}`} onClick={() => go({ session: sessionId, lesson: lesson.id })}>Luyện tập</button>
          <button className={`tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => go({ session: sessionId, lesson: lesson.id, tab: 'manage' })}>Quản lý câu ({lesson.sentenceCount})</button>
        </div>
        {tab === 'practice' ? (
          <Practice
            key={lesson.id}
            lessonId={lesson.id}
            nextLesson={nextLesson}
            onOpenLesson={(id) => go({ session: sessionId, lesson: id })}
            onManage={() => go({ session: sessionId, lesson: lesson.id, tab: 'manage' })}
            onProgressChanged={refresh}
          />
        ) : (
          <SentenceManager key={lesson.id} lessonId={lesson.id} onChanged={refresh} onConfirm={showConfirm} />
        )}
      </div>
    );
  };

  return (
    <div className="tw-shell">
      <aside className="tw-nav">
        <div className="tw-nav-title">
          Sessions
          <span className="flex" style={{ gap: 2 }}>
            <button className="icon-btn" title="Import từ file Excel / JSON" onClick={() => setImportOpen(true)}><Upload size={14} /></button>
            <button className="icon-btn" title="Tạo session" onClick={() => setSessionForm({ title: '', description: '', level: 'A2' })}><Plus size={14} /></button>
          </span>
        </div>
        {sessions?.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0 8px' }}>Chưa có session nào.</p>}
        {sessions?.map((s, i) => (
          <div key={s.id}>
            <div style={{ position: 'relative' }}>
              <button className={`tw-nav-item ${s.id === sessionId && !lessonId ? 'active' : ''}`} onClick={() => go({ session: s.id })}>
                <span
                  className="icon-btn"
                  role="button"
                  style={{ padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); setExpanded({ ...expanded, [s.id]: !expanded[s.id] }); if (s.id !== sessionId) go({ session: s.id }); }}
                >
                  {expanded[s.id] && s.id === sessionId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <span className="tw-count">{s.progress.completed}/{s.progress.total}</span>
                <span className="tw-nav-actions">
                  <span className="icon-btn" role="button" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id); }}><Ellipsis size={14} /></span>
                </span>
              </button>
              {menuId === s.id && (
                <Popover onClose={() => setMenuId(null)} style={{ top: '100%', left: 16 }}>
                  <button className="tw-popover-item" onClick={() => { setMenuId(null); setSessionForm({ id: s.id, title: s.title, description: s.description || '', level: s.level }); }}><Pencil size={14} /> Chỉnh sửa</button>
                  <button className="tw-popover-item" disabled={i === 0} onClick={() => { setMenuId(null); moveSession(i, -1); }}><ArrowUp size={14} /> Lên trên</button>
                  <button className="tw-popover-item" disabled={i === sessions.length - 1} onClick={() => { setMenuId(null); moveSession(i, 1); }}><ArrowDown size={14} /> Xuống dưới</button>
                  <button className="tw-popover-item danger" onClick={() => { setMenuId(null); deleteSession(s); }}><Trash2 size={14} /> Xóa session</button>
                </Popover>
              )}
            </div>
            {s.id === sessionId && expanded[s.id] && (
              <div style={{ paddingLeft: 18 }}>
                {lessons.map((l) => (
                  <button key={l.id} className={`tw-nav-item ${l.id === lessonId ? 'active' : ''}`} style={{ fontSize: '0.8rem' }} onClick={() => go({ session: s.id, lesson: l.id })}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                    <span className="tw-count">{l.progress.completed}/{l.progress.total}</span>
                  </button>
                ))}
                <button className="tw-nav-item" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} onClick={() => setLessonForm({ title: '', description: '' })}>
                  <Plus size={12} /> Thêm bài
                </button>
              </div>
            )}
          </div>
        ))}
      </aside>

      <section className="tw-main" style={{ overflowY: 'auto' }}>{renderMain()}</section>

      {sessionForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{sessionForm.id ? 'Sửa session' : 'Tạo session'}</h3>
              <button className="hamburger-btn" onClick={() => setSessionForm(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveSession}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tên session <span className="form-required">*</span></label>
                  <input autoFocus required className="form-input" placeholder="VD: Daily Conversation" value={sessionForm.title} onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trình độ</label>
                  <select className="form-input" value={sessionForm.level} onChange={(e) => setSessionForm({ ...sessionForm, level: e.target.value })}>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả</label>
                  <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={sessionForm.description} onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSessionForm(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{sessionForm.id ? 'Lưu' : 'Tạo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lessonForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{lessonForm.id ? 'Sửa bài' : 'Thêm bài'}</h3>
              <button className="hamburger-btn" onClick={() => setLessonForm(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveLesson}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tên bài <span className="form-required">*</span></label>
                  <input autoFocus required className="form-input" placeholder="VD: At the coffee shop" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả</label>
                  <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={lessonForm.description} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} />
                </div>
                {!lessonForm.id && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sau khi tạo, bạn sẽ được chuyển sang màn thêm câu.</p>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setLessonForm(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{lessonForm.id ? 'Lưu' : 'Tạo bài'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importOpen && (
        <ImportSessions
          onClose={() => setImportOpen(false)}
          onImported={async (created) => {
            setImportOpen(false);
            await loadSessions();
            if (created[0]?.id) go({ session: created[0].id });
          }}
        />
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
