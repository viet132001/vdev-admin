import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, BookOpen, Clock, Award, CheckCircle, CheckCircle2, ChevronRight, GraduationCap, Volume2, Trash2, Upload, Music, Edit, Repeat } from 'lucide-react';

export const Learning: React.FC = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<any | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  // Forms
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [cTitle, setCTitle] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cDiff, setCDiff] = useState('BEGINNER');
  const [cLang, setCLang] = useState('vi');
  const [cDur, setCDur] = useState('180');

  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sTitle, setSTitle] = useState('');
  const [sDesc, setSDesc] = useState('');

  const [showLessonForm, setShowLessonForm] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [lTitle, setLTitle] = useState('');
  const [lSummary, setLSummary] = useState('');
  const [lContent, setLContent] = useState('');

  // Auto Run States
  const [isAutoRun, setIsAutoRun] = useState(false);
  const [autoRunCountdown, setAutoRunCountdown] = useState<number | null>(null);
  const [autoRunIntervalId, setAutoRunIntervalId] = useState<any>(null);

  const loadCourses = async () => {
    try {
      const data = await api.get('/api/learning/courses');
      setCourses(data);
      if (data.length > 0 && !selectedCourse) {
        // Load detailed first course
        const detail = await api.get(`/api/learning/courses/${data[0].id}`);
        setSelectedCourse(detail);
      } else if (selectedCourse) {
        const detail = await api.get(`/api/learning/courses/${selectedCourse.id}`);
        setSelectedCourse(detail);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleSelectCourse = async (course: any) => {
    try {
      const detail = await api.get(`/api/learning/courses/${course.id}`);
      setSelectedCourse(detail);
      setSelectedLesson(null);
    } catch (err) {
      alert('Không thể tải thông tin khóa học');
    }
  };

  const handleSelectLesson = async (lesson: any) => {
    try {
      const detail = await api.get(`/api/learning/lessons/${lesson.id}`);
      setSelectedLesson(detail);
    } catch (err) {
      alert('Không thể tải chi tiết bài học');
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLesson) return;

    setUploadingAudio(true);
    try {
      let fileId = '';
      try {
        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('vdev_token');
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/storage/upload`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData
        });

        if (response.ok) {
          const resData = await response.json();
          fileId = resData.data?.file?.id || resData.file?.id || resData.data?.id || resData.id;
        } else {
          throw new Error('API Error');
        }
      } catch (err) {
        // Fallback to api helper for mock mode
        const formData = new FormData();
        formData.append('file', file);
        const resData = await api.post('/api/storage/upload', formData);
        fileId = resData.file?.id || resData.id;
      }

      if (!fileId) throw new Error('Không thể tải lên file');

      // Associate file with lesson
      await api.post(`/api/learning/lessons/${selectedLesson.id}/assets`, {
        fileId,
        assetType: 'AUDIO',
        orderIndex: 1
      });

      // Reload lesson details
      await handleSelectLesson(selectedLesson);
      alert('Tải lên file MP3 thành công!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Có lỗi xảy ra khi tải lên file MP3');
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleDeleteAudio = async (assetId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa file âm thanh này không?')) return;
    try {
      await api.delete(`/api/learning/lessons/assets/${assetId}`);
      if (selectedLesson) {
        await handleSelectLesson(selectedLesson);
      }
      alert('Xóa file âm thanh thành công');
    } catch (err) {
      alert('Không thể xóa file âm thanh');
    }
  };

  const handleEditCourse = (course: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setCTitle(course.title);
    setCDesc(course.description || '');
    setCDiff(course.difficulty || 'BEGINNER');
    setCLang(course.language || 'vi');
    setCDur((course.estimatedMinutes || 180).toString());
    setEditingCourseId(course.id);
    setShowCourseForm(true);
  };

  const handleDeleteCourse = async (courseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa khóa học này không?')) return;
    try {
      await api.delete(`/api/learning/courses/${courseId}`);
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(null);
        setSelectedLesson(null);
      }
      await loadCourses();
      alert('Xóa khóa học thành công');
    } catch (err) {
      alert('Không thể xóa khóa học');
    }
  };

  const handleEditSection = (section: any) => {
    setSTitle(section.title);
    setSDesc(section.description || '');
    setEditingSectionId(section.id);
    setShowSectionForm(true);
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa chương học này không?')) return;
    try {
      await api.delete(`/api/learning/sections/${sectionId}`);
      await loadCourses();
      alert('Xóa chương học thành công');
    } catch (err) {
      alert('Không thể xóa chương học');
    }
  };

  const handleEditLesson = (lesson: any) => {
    setLTitle(lesson.title);
    setLSummary(lesson.summary || '');
    setLContent(lesson.content || '');
    setEditingLessonId(lesson.id);
    setShowLessonForm(true);
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài học này không?')) return;
    try {
      await api.delete(`/api/learning/lessons/${lessonId}`);
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(null);
      }
      await loadCourses();
      alert('Xóa bài học thành công');
    } catch (err) {
      alert('Không thể xóa bài học');
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cTitle.trim()) return;

    try {
      if (editingCourseId) {
        const updated = await api.patch(`/api/learning/courses/${editingCourseId}`, {
          title: cTitle,
          description: cDesc,
          difficulty: cDiff,
          language: cLang,
          estimatedMinutes: parseInt(cDur),
          isPublished: true
        });
        setEditingCourseId(null);
        alert('Cập nhật khóa học thành công');
        await handleSelectCourse(updated);
      } else {
        const newCourse = await api.post('/api/learning/courses', {
          title: cTitle,
          description: cDesc,
          difficulty: cDiff,
          language: cLang,
          estimatedMinutes: parseInt(cDur),
          isPublished: true,
          coverFileId: null
        });
        await handleSelectCourse(newCourse);
      }
      setCTitle('');
      setCDesc('');
      setShowCourseForm(false);
      await loadCourses();
    } catch (err) {
      alert(editingCourseId ? 'Cập nhật khóa học thất bại' : 'Tạo khóa học thất bại');
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sTitle.trim()) return;

    try {
      if (editingSectionId) {
        await api.patch(`/api/learning/sections/${editingSectionId}`, {
          title: sTitle,
          description: sDesc
        });
        setEditingSectionId(null);
        alert('Cập nhật chương học thành công');
      } else if (selectedCourse) {
        const nextIndex = (selectedCourse.sections || []).length + 1;
        await api.post(`/api/learning/courses/${selectedCourse.id}/sections`, {
          title: sTitle,
          description: sDesc,
          orderIndex: nextIndex
        });
      }
      setSTitle('');
      setSDesc('');
      setShowSectionForm(false);
      await loadCourses();
    } catch (err) {
      alert(editingSectionId ? 'Cập nhật chương học thất bại' : 'Tạo chương học thất bại');
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lTitle.trim()) return;

    try {
      if (editingLessonId) {
        await api.patch(`/api/learning/lessons/${editingLessonId}`, {
          title: lTitle,
          summary: lSummary,
          content: lContent
        });
        setEditingLessonId(null);
        alert('Cập nhật bài học thành công');
        if (selectedLesson && selectedLesson.id === editingLessonId) {
          await handleSelectLesson({ id: editingLessonId });
        }
      } else if (activeSectionId) {
        await api.post(`/api/learning/sections/${activeSectionId}/lessons`, {
          title: lTitle,
          summary: lSummary,
          content: lContent || `# ${lTitle}\nNội dung chi tiết bài học...`,
          durationSeconds: 300,
          orderIndex: 1
        });
      }
      setLTitle('');
      setLSummary('');
      setLContent('');
      setShowLessonForm(false);
      await loadCourses();
    } catch (err) {
      alert(editingLessonId ? 'Cập nhật bài học thất bại' : 'Tạo bài học thất bại');
    }
  };

  const toggleLessonProgress = async (lesson: any) => {
    try {
      const newProgress = lesson.isCompleted ? 0 : 100;
      await api.post(`/api/learning/lessons/${lesson.id}/progress`, {
        progressPercent: newProgress
      });
      
      // Update local state details
      if (selectedLesson && selectedLesson.id === lesson.id) {
        setSelectedLesson({
          ...selectedLesson,
          isCompleted: !lesson.isCompleted,
          completedAt: !lesson.isCompleted ? new Date().toISOString() : null
        });
      }
      
      await loadCourses();
    } catch (err) {
      alert('Cập nhật tiến độ thất bại');
    }
  };

  const getAllLessons = () => {
    if (!selectedCourse) return [];
    const list: any[] = [];
    (selectedCourse.sections || []).forEach((sec: any) => {
      (sec.lessons || []).forEach((les: any) => {
        list.push({ ...les, sectionId: sec.id });
      });
    });
    return list;
  };

  const handleAudioEnded = () => {
    if (!isAutoRun) return;

    if (autoRunIntervalId) {
      clearInterval(autoRunIntervalId);
    }

    const allLessons = getAllLessons();
    const currentIdx = allLessons.findIndex(l => l.id === selectedLesson?.id);
    if (currentIdx === -1 || allLessons.length === 0) return;

    const nextIdx = (currentIdx + 1) % allLessons.length;
    const nextLesson = allLessons[nextIdx];

    let secondsLeft = 4;
    setAutoRunCountdown(secondsLeft);

    const interval = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        setAutoRunCountdown(null);
        setAutoRunIntervalId(null);
        handleSelectLesson(nextLesson);
      } else {
        setAutoRunCountdown(secondsLeft);
      }
    }, 1000);

    setAutoRunIntervalId(interval);
  };

  useEffect(() => {
    if (!isAutoRun && autoRunIntervalId) {
      clearInterval(autoRunIntervalId);
      setAutoRunCountdown(null);
      setAutoRunIntervalId(null);
    }
  }, [isAutoRun]);

  useEffect(() => {
    if (autoRunIntervalId) {
      clearInterval(autoRunIntervalId);
      setAutoRunCountdown(null);
      setAutoRunIntervalId(null);
    }
  }, [selectedLesson?.id]);

  return (
    <div>
      <header className="flex justify-between align-center mb-4">
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Học tập & Đào tạo</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Theo dõi lộ trình, chương trình học và tài nguyên bài học</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCourseForm(!showCourseForm)}>
          <Plus size={16} />
          <span>Tạo khóa học</span>
        </button>
      </header>

      {/* Course Creator Form */}
      {showCourseForm && (
        <form onSubmit={handleCreateCourse} className="card flex flex-col gap-4 mb-4" style={{ maxWidth: '600px' }}>
          <h3>{editingCourseId ? 'Chỉnh sửa khóa học' : 'Khóa học mới'}</h3>
          <div className="form-group">
            <label className="form-label">Tên khóa học</label>
            <input type="text" className="form-input" required value={cTitle} onChange={(e) => setCTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả ngắn</label>
            <textarea className="form-input" style={{ minHeight: '80px' }} value={cDesc} onChange={(e) => setCDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="form-group">
              <label className="form-label">Độ khó</label>
              <select className="form-input" value={cDiff} onChange={(e) => setCDiff(e.target.value)}>
                <option value="BEGINNER">Cơ bản (Beginner)</option>
                <option value="INTERMEDIATE">Trung cấp</option>
                <option value="ADVANCED">Nâng cao</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ngôn ngữ</label>
              <input type="text" className="form-input" value={cLang} onChange={(e) => setCLang(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Thời gian ước lượng (phút)</label>
              <input type="number" className="form-input" value={cDur} onChange={(e) => setCDur(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Lưu lại</button>
            <button type="button" className="btn btn-secondary" onClick={() => {
              setShowCourseForm(false);
              setEditingCourseId(null);
              setCTitle('');
              setCDesc('');
            }}>Hủy</button>
          </div>
        </form>
      )}

      {/* Main layout: courses sidebar and section lists */}
      <div className="flex gap-6 mt-4" style={{ alignItems: 'stretch' }}>
        {/* Left courses selector list */}
        <div className="flex flex-col gap-4" style={{ width: '280px', flexShrink: 0 }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Khóa học khả dụng</h3>
          <div className="flex flex-col gap-2">
            {courses.map(course => (
              <div 
                key={course.id} 
                onClick={() => handleSelectCourse(course)}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: selectedCourse?.id === course.id ? 'var(--primary-light)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderColor: selectedCourse?.id === course.id ? 'var(--primary)' : 'var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: selectedCourse?.id === course.id ? 'var(--primary)' : 'var(--text-main)', flexGrow: 1, paddingRight: '8px' }}>
                    {course.title}
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={(e) => handleEditCourse(course, e)} 
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                      title="Sửa khóa học"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteCourse(course.id, e)} 
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0 }}
                      title="Xóa khóa học"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {course.description}
                </p>
                <div className="flex gap-4 mt-4" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span className="flex align-center gap-2"><Clock size={12} /> {course.estimatedMinutes} phút</span>
                  <span className="flex align-center gap-2"><Award size={12} /> {course.difficulty}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle/Right workspace: details of course sections and preview lesson */}
        <div style={{ flexGrow: 1 }} className="flex flex-col gap-4">
          {selectedCourse ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Sections list card */}
              <div className="card">
                <div className="flex justify-between align-center mb-4">
                  <h3 style={{ fontSize: '1.1rem' }}>Nội dung khóa học</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowSectionForm(!showSectionForm)}>
                    <Plus size={14} /> Thêm chương
                  </button>
                </div>

                {showSectionForm && (
                  <form onSubmit={handleCreateSection} className="flex flex-col gap-2 mb-4" style={{ border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                    <h4>{editingSectionId ? 'Chỉnh sửa chương' : 'Chương học mới'}</h4>
                    <div className="form-group">
                      <label className="form-label">Tên chương</label>
                      <input type="text" className="form-input" required value={sTitle} onChange={(e) => setSTitle(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mô tả chương</label>
                      <input type="text" className="form-input" value={sDesc} onChange={(e) => setSDesc(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="btn btn-primary btn-sm">Lưu chương</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                        setShowSectionForm(false);
                        setEditingSectionId(null);
                        setSTitle('');
                        setSDesc('');
                      }}>Hủy</button>
                    </div>
                  </form>
                )}

                {showLessonForm && (
                  <form onSubmit={handleCreateLesson} className="flex flex-col gap-2 mb-4" style={{ border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                    <h4>{editingLessonId ? 'Chỉnh sửa bài học' : 'Bài học mới'}</h4>
                    <div className="form-group">
                      <label className="form-label">Tiêu đề bài</label>
                      <input type="text" className="form-input" required value={lTitle} onChange={(e) => setLTitle(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nội dung (văn bản/Markdown)</label>
                      <textarea className="form-input" style={{ minHeight: '80px' }} value={lContent} onChange={(e) => setLContent(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="btn btn-primary btn-sm">Lưu bài học</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                        setShowLessonForm(false);
                        setEditingLessonId(null);
                        setLTitle('');
                        setLSummary('');
                        setLContent('');
                      }}>Hủy</button>
                    </div>
                  </form>
                )}

                <div className="flex flex-col gap-4">
                  {(selectedCourse.sections || []).length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Khóa học này chưa được phân chia chương học.</p>
                  ) : (
                    selectedCourse.sections.map((section: any) => (
                      <div key={section.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                        <div className="flex justify-between align-center">
                          <div>
                            <h4 style={{ fontSize: '0.95rem' }}>{section.title}</h4>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{section.description}</span>
                          </div>
                          <div className="flex gap-2 align-center">
                            <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => {
                              setActiveSectionId(section.id);
                              setEditingLessonId(null);
                              setShowLessonForm(true);
                            }}>
                              + Bài học
                            </button>
                            <button 
                              onClick={() => handleEditSection(section)} 
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0 }}
                              title="Sửa chương"
                            >
                              <Edit size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteSection(section.id)} 
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', padding: 0 }}
                              title="Xóa chương"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Lessons in section */}
                        <div className="flex flex-col gap-2 mt-4" style={{ paddingLeft: '12px' }}>
                          {(section.lessons || []).map((lesson: any) => (
                            <div 
                              key={lesson.id}
                              onClick={() => handleSelectLesson(lesson)}
                              className="flex justify-between align-center"
                              style={{
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                backgroundColor: selectedLesson?.id === lesson.id ? 'var(--primary-light)' : 'transparent',
                                border: selectedLesson?.id === lesson.id ? '1px solid var(--primary)' : '1px solid transparent',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div className="flex align-center gap-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLessonProgress(lesson);
                                  }}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: lesson.isCompleted ? 'var(--success)' : 'var(--text-muted)' }}
                                >
                                  <CheckCircle2 size={16} fill={lesson.isCompleted ? 'currentColor' : 'none'} />
                                </button>
                                <span style={{ fontSize: '0.85rem', fontWeight: selectedLesson?.id === lesson.id ? '600' : '400' }}>
                                  {lesson.title}
                                </span>
                              </div>
                              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Lesson preview panel */}
              <div className="card">
                {selectedLesson ? (
                  <div className="flex flex-col gap-4">
                    <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                      <div className="flex justify-between align-center">
                        <span className="badge badge-info btn-sm">BÀI HỌC CHI TIẾT</span>
                        <div className="flex gap-2">
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEditLesson(selectedLesson)}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Edit size={12} />
                            <span>Sửa</span>
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleDeleteLesson(selectedLesson.id)}
                          >
                            <Trash2 size={12} />
                            <span>Xóa</span>
                          </button>
                          <button 
                            className={`btn ${selectedLesson.isCompleted ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                            onClick={() => toggleLessonProgress(selectedLesson)}
                          >
                            {selectedLesson.isCompleted ? 'Đánh dấu chưa học' : 'Hoàn thành bài'}
                          </button>
                        </div>
                      </div>
                      <h3 style={{ fontSize: '1.3rem', marginTop: '12px' }}>{selectedLesson.title}</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{selectedLesson.summary || 'Không có tóm tắt ngắn'}</p>
                    </div>

                    {/* Audio Asset player & Upload section */}
                    {(() => {
                      const audioAsset = selectedLesson.assets?.find((asset: any) => asset.assetType === 'AUDIO');
                      return (
                        <div style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-card)',
                          border: '1px dashed var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}>
                          {audioAsset ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Music size={16} />
                                  <span>Tệp âm thanh: {audioAsset.file?.originalName || 'audio.mp3'}</span>
                                </span>
                                <div className="flex gap-2">
                                  <button 
                                    className={`btn btn-sm ${isAutoRun ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                                    onClick={() => setIsAutoRun(!isAutoRun)}
                                    title="Tự động chuyển bài học sau khi nghe hết"
                                  >
                                    <Repeat size={14} />
                                    <span>Auto Run: {isAutoRun ? 'ON' : 'OFF'}</span>
                                  </button>
                                  <button 
                                    className="btn btn-secondary btn-sm" 
                                    style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                                    onClick={() => handleDeleteAudio(audioAsset.id)}
                                  >
                                    <Trash2 size={14} />
                                    <span>Xóa</span>
                                  </button>
                                </div>
                              </div>
                              <audio 
                                controls 
                                autoPlay={isAutoRun}
                                onEnded={handleAudioEnded}
                                style={{ width: '100%', marginTop: '4px', outline: 'none' }}
                                src={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/storage/files/${audioAsset.file?.id || audioAsset.fileId}/download`} 
                              />
                              {autoRunCountdown !== null && (
                                <div style={{ 
                                  backgroundColor: 'var(--primary-light)', 
                                  color: 'var(--primary)', 
                                  padding: '8px 12px', 
                                  borderRadius: 'var(--radius-sm)', 
                                  fontSize: '0.8rem', 
                                  fontWeight: '600', 
                                  textAlign: 'center',
                                  marginTop: '4px' 
                                }}>
                                  Tự động chuyển bài học tiếp theo sau {autoRunCountdown} giây...
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Volume2 size={16} />
                                <span>Bài học này chưa có file nghe (MP3)</span>
                              </div>
                              <div>
                                <label 
                                  className={`btn btn-secondary btn-sm ${uploadingAudio ? 'disabled' : ''}`} 
                                  style={{ cursor: uploadingAudio ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <Upload size={14} />
                                  <span>{uploadingAudio ? 'Đang tải lên...' : 'Tải lên MP3'}</span>
                                  <input 
                                    type="file" 
                                    accept="audio/mp3,audio/*" 
                                    style={{ display: 'none' }} 
                                    onChange={handleAudioUpload} 
                                    disabled={uploadingAudio} 
                                  />
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ 
                      fontSize: '0.9rem', 
                      lineHeight: '1.6', 
                      backgroundColor: 'var(--bg-app)', 
                      padding: '16px', 
                      borderRadius: 'var(--radius-md)',
                      minHeight: '200px',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {selectedLesson.content}
                    </div>

                    {selectedLesson.isCompleted && (
                      <div className="flex align-center gap-2" style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: '600' }}>
                        <CheckCircle size={14} />
                        <span>Bạn đã hoàn thành bài học này vào lúc {new Date(selectedLesson.completedAt).toLocaleTimeString('vi-VN')}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col align-center justify-between" style={{ margin: 'auto', padding: '40px', color: 'var(--text-muted)' }}>
                    <GraduationCap size={48} />
                    <p style={{ marginTop: '16px', textAlign: 'center' }}>Chọn một bài học từ danh sách chương học bên trái để xem nội dung giảng dạy</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card flex flex-col align-center justify-between" style={{ padding: '40px', color: 'var(--text-muted)' }}>
              <BookOpen size={48} />
              <p style={{ marginTop: '16px' }}>Chưa chọn khóa học nào.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
