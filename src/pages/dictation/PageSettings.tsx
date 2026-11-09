import React, { useCallback, useEffect, useState } from 'react';
import { CircleCheck, Radio, RotateCcw, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { WORKER_COMMAND, listPages, savePage, workerHealth, type CoursePage, type VideoGenre } from './lessonWorker';

const DEFAULT_POST_TIME = '19:30';

interface PageSettingsProps {
  course: { id: string; title: string };
  channelsVersion: number;
  onManageChannels: () => void;
  onSaved: (page: CoursePage) => void;
  onClose: () => void;
}

// A course is one page: the genre decides how its videos look and who is in them, its rules go to Claude with every
// lesson, and it posts to a page and channel of its own or to its genre's.
export const PageSettings: React.FC<PageSettingsProps> = ({ course, channelsVersion, onManageChannels, onSaved, onClose }) => {
  const { busy, run } = useBusy();
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [genres, setGenres] = useState<VideoGenre[]>([]);
  const [saved, setSaved] = useState<CoursePage | null>(null);
  const [form, setForm] = useState({ genre: '', videoStyle: '', rules: '', ownPage: true, postTime: DEFAULT_POST_TIME });
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    setState('loading');
    try {
      const health = await workerHealth();
      const list: VideoGenre[] = health.genres ?? [];
      const page = (await listPages()).find((p) => p.courseId === course.id) ?? null;
      setGenres(list);
      setSaved(page);
      setForm(page
        ? { genre: page.genre, videoStyle: page.videoStyle, rules: page.rules, ownPage: page.ownPage, postTime: page.postTime }
        : { genre: list[0]?.id ?? '', videoStyle: list[0]?.styles[0]?.id ?? '', rules: '', ownPage: true, postTime: DEFAULT_POST_TIME });
      setState('online');
    } catch {
      setState('offline');
    }
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  // Connecting the page happens in the channel manager; coming back shows whether it worked
  useEffect(() => {
    if (!channelsVersion) return;
    listPages().then((list) => setSaved(list.find((p) => p.courseId === course.id) ?? null)).catch(() => undefined);
  }, [channelsVersion, course.id]);

  const genre = genres.find((g) => g.id === form.genre);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      try {
        const page = await savePage(course.id, { ...form, title: course.title });
        setSaved(page);
        onSaved(page);
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : 'Không lưu được cài đặt page');
      }
    });
  };

  const header = (
    <div className="modal-header">
      <h3 style={{ margin: 0 }}>Cài đặt page: {course.title}</h3>
      <button className="hamburger-btn" title="Đóng" onClick={onClose}><X size={18} /></button>
    </div>
  );

  if (state !== 'online') {
    return (
      <div className="modal-overlay">
        <div className="modal-content lg-modal">
          {header}
          <div className="modal-body">
            {state === 'loading'
              ? <div className="loading-container"><span className="spinner"></span><span>Đang kết nối...</span></div>
              : <><p>Cài đặt page nằm ở công cụ trên máy, chưa kết nối được. Nếu chưa cài, chạy:</p><pre className="lg-command">{WORKER_COMMAND}</pre></>}
          </div>
          {state === 'offline' && <div className="modal-footer"><button className="btn btn-primary" onClick={load}><RotateCcw size={16} /> Kết nối lại</button></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content lg-modal">
        {header}
        <form onSubmit={save}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Thể loại</label>
              <select className="form-input" value={form.genre} onChange={(e) => {
                const next = genres.find((g) => g.id === e.target.value);
                update({ genre: e.target.value, videoStyle: next?.styles[0]?.id ?? '' });
              }}>
                {genres.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              {genre && <p className="lg-meta">{genre.description}. Nhân vật, giọng, lời chào và lời kết đi theo thể loại.</p>}
            </div>
            {(genre?.styles.length ?? 0) > 1 && (
              <div className="form-group">
                <label className="form-label">Kiểu video</label>
                <select className="form-input" value={form.videoStyle} onChange={(e) => update({ videoStyle: e.target.value })}>
                  {genre?.styles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Luật riêng của khoá học</label>
              <textarea rows={6} maxLength={4000} className="form-input" style={{ resize: 'vertical' }} placeholder="VD: Mỗi tập là một tình huống ở văn phòng. Luôn có một câu hỏi cho người xem ở cuối. Không nhắc lại chuyện của tập trước." value={form.rules} onChange={(e) => update({ rules: e.target.value })} />
              <p className="lg-meta">Gửi kèm cho Claude ở mọi bài của khoá học, đi trước luật chung của thể loại khi hai bên khác nhau.</p>
            </div>
            <div className="form-group">
              <label className="form-label">Kênh đăng</label>
              <label className="flex align-center gap-2" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="radio" checked={form.ownPage} onChange={() => update({ ownPage: true })} />
                Page Facebook và kênh YouTube riêng cho khoá học này
              </label>
              <label className="flex align-center gap-2" style={{ fontSize: '0.875rem', cursor: 'pointer', marginTop: 6 }}>
                <input type="radio" checked={!form.ownPage} onChange={() => update({ ownPage: false })} />
                Dùng chung kênh của thể loại {genre?.channelName ?? ''}
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Giờ đăng mỗi ngày</label>
              <input type="time" required className="form-input" style={{ maxWidth: 160 }} value={form.postTime} onChange={(e) => update({ postTime: e.target.value })} />
              <p className="lg-meta">Khi tạo nhiều bài một lần, mỗi ngày đăng một video vào giờ này.</p>
            </div>
            {saved && (
              <div className="vl-notice" style={{ marginTop: 4 }}>
                <div className="flex align-center gap-2"><CircleCheck size={14} /> Đã cài đặt. Tập tiếp theo là tập {saved.nextEpisode}.</div>
                <div className="lg-meta" style={{ margin: '6px 0 0' }}>
                  Đăng lên {saved.channel.name}: Facebook {saved.channel.facebook ? 'đã kết nối' : 'chưa kết nối'}, YouTube {saved.channel.youtube ? 'đã kết nối' : 'chưa kết nối'}.
                </div>
                {(!saved.channel.facebook || !saved.channel.youtube) && (
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={onManageChannels}><Radio size={14} /> Kết nối ở Quản lý kênh</button>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>
            <button type="submit" className="btn btn-primary" disabled={!!busy || !form.genre}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
