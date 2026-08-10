import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Plus, Search, Calendar, Trash2, CheckCircle2, 
  Circle, Clock, AlertCircle, X, ChevronLeft, ChevronRight, Edit2, Check
} from 'lucide-react';

export const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Create Task Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<{ title: string; deadline: string }[]>([]);
  const [tempSubtaskTitle, setTempSubtaskTitle] = useState('');
  const [tempSubtaskDeadline, setTempSubtaskDeadline] = useState('');

  // Editing Task details state
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskDeadline, setEditTaskDeadline] = useState('');
  const [editTaskStatus, setEditTaskStatus] = useState('PENDING');

  // Editing Subtask state
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');
  const [editSubtaskDeadline, setEditSubtaskDeadline] = useState('');

  // Add subtask inline state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDeadline, setNewSubtaskDeadline] = useState('');

  // Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  // Debouncing search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const query = `/api/tasks?page=${page}&limit=${limit}&keyword=${encodeURIComponent(debouncedSearchQuery)}&status=${statusFilter}`;
      const response = await api.get(query);
      
      // Real backend response structure
      if (response && response.data) {
        setTasks(response.data);
        setTotal(response.total);
        setTotalPages(response.totalPages);

        if (response.data.length > 0) {
          if (!selectedTask) {
            setSelectedTask(response.data[0]);
          } else {
            const updated = response.data.find((t: any) => t.id === selectedTask.id);
            if (updated) {
              setSelectedTask(updated);
            } else {
              setSelectedTask(response.data[0]);
            }
          }
        } else {
          setSelectedTask(null);
        }
      } else {
        setTasks([]);
        setSelectedTask(null);
      }
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [page, debouncedSearchQuery, statusFilter]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const payload = {
        title: newTaskTitle,
        description: newTaskDesc,
        deadline: newTaskDeadline ? new Date(newTaskDeadline).toISOString() : null,
        subtasks: newTaskSubtasks.map(st => ({
          title: st.title,
          deadline: st.deadline ? new Date(st.deadline).toISOString() : null
        }))
      };

      const created = await api.post('/api/tasks', payload);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskDeadline('');
      setNewTaskSubtasks([]);
      setShowAddModal(false);
      await loadTasks();
      setSelectedTask(created);
    } catch (err) {
      alert('Tạo công việc thất bại');
    }
  };

  const handleAddTempSubtask = () => {
    if (!tempSubtaskTitle.trim()) return;
    setNewTaskSubtasks([...newTaskSubtasks, { title: tempSubtaskTitle, deadline: tempSubtaskDeadline }]);
    setTempSubtaskTitle('');
    setTempSubtaskDeadline('');
  };

  const handleRemoveTempSubtask = (idx: number) => {
    setNewTaskSubtasks(newTaskSubtasks.filter((_, i) => i !== idx));
  };

  const startEditingTask = () => {
    if (!selectedTask) return;
    setEditTaskTitle(selectedTask.title);
    setEditTaskDesc(selectedTask.description || '');
    setEditTaskDeadline(selectedTask.deadline ? selectedTask.deadline.substring(0, 16) : '');
    setEditTaskStatus(selectedTask.status);
    setIsEditingTask(true);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !editTaskTitle.trim()) return;

    try {
      const updated = await api.patch(`/api/tasks/${selectedTask.id}`, {
        title: editTaskTitle,
        description: editTaskDesc,
        deadline: editTaskDeadline ? new Date(editTaskDeadline).toISOString() : null,
        status: editTaskStatus
      });
      setIsEditingTask(false);
      await loadTasks();
      setSelectedTask(updated);
    } catch (err) {
      alert('Cập nhật công việc thất bại');
    }
  };

  const handleDeleteTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm(
      'Xóa công việc',
      'Bạn có chắc chắn muốn xóa công việc này? Công việc sẽ được đưa vào thùng rác (xóa mềm).',
      async () => {
        try {
          await api.delete(`/api/tasks/${taskId}`);
          if (selectedTask?.id === taskId) {
            setSelectedTask(null);
          }
          await loadTasks();
        } catch (err) {
          alert('Xóa công việc thất bại');
        }
      }
    );
  };

  // Subtask Actions
  const handleToggleSubtask = async (subtask: any) => {
    if (!selectedTask) return;
    try {
      await api.patch(`/api/tasks/${selectedTask.id}/subtasks/${subtask.id}`, {
        isCompleted: !subtask.isCompleted
      });
      await loadTasks();
    } catch (err) {
      alert('Cập nhật nhiệm vụ phụ thất bại');
    }
  };

  const handleAddSubtaskInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newSubtaskTitle.trim()) return;

    try {
      await api.post(`/api/tasks/${selectedTask.id}/subtasks`, {
        title: newSubtaskTitle,
        deadline: newSubtaskDeadline ? new Date(newSubtaskDeadline).toISOString() : null
      });
      setNewSubtaskTitle('');
      setNewSubtaskDeadline('');
      await loadTasks();
    } catch (err) {
      alert('Thêm nhiệm vụ phụ thất bại');
    }
  };

  const startEditingSubtask = (st: any) => {
    setEditingSubtaskId(st.id);
    setEditSubtaskTitle(st.title);
    setEditSubtaskDeadline(st.deadline ? st.deadline.substring(0, 10) : '');
  };

  const handleUpdateSubtask = async (subtaskId: string) => {
    if (!selectedTask || !editSubtaskTitle.trim()) return;
    try {
      await api.patch(`/api/tasks/${selectedTask.id}/subtasks/${subtaskId}`, {
        title: editSubtaskTitle,
        deadline: editSubtaskDeadline ? new Date(editSubtaskDeadline).toISOString() : null
      });
      setEditingSubtaskId(null);
      await loadTasks();
    } catch (err) {
      alert('Cập nhật nhiệm vụ phụ thất bại');
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!selectedTask) return;
    showConfirm(
      'Xóa nhiệm vụ phụ',
      'Bạn có muốn xóa nhiệm vụ phụ này khỏi công việc?',
      async () => {
        try {
          await api.delete(`/api/tasks/${selectedTask.id}/subtasks/${subtaskId}`);
          await loadTasks();
        } catch (err) {
          alert('Xóa thất bại');
        }
      }
    );
  };

  const showConfirm = (title: string, message: string, action: () => Promise<void>) => {
    setConfirmDialog({
      show: true,
      title,
      message,
      action
    });
  };

  const handleConfirmAction = async () => {
    if (confirmDialog) {
      await confirmDialog.action();
      setConfirmDialog(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>Chờ xử lý</span>;
      case 'IN_PROGRESS':
        return <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Đang làm</span>;
      case 'COMPLETED':
        return <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Hoàn thành</span>;
      case 'CANCELLED':
        return <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>Đã hủy</span>;
      default:
        return null;
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="flex justify-between align-center mb-4" style={{ flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Quản lý Công việc</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Theo dõi công việc, phân việc phụ và kiểm soát deadline</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span>Tạo công việc</span>
        </button>
      </header>

      {/* Main Workspace */}
      <div className="flex gap-6 mt-4" style={{ flexGrow: 1, minHeight: 0, alignItems: 'stretch' }}>
        {/* Left column: List with filters */}
        <div className="flex flex-col gap-4" style={{ width: '360px', flexShrink: 0, height: '100%' }}>
          {/* Controls */}
          <div className="flex flex-col gap-2">
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-input" 
                style={{ width: '100%', paddingLeft: '36px' }} 
                placeholder="Tìm kiếm công việc..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <select 
              className="form-input" 
              value={statusFilter} 
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ xử lý</option>
              <option value="IN_PROGRESS">Đang làm</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>

          {/* List Area */}
          <div className="flex flex-col" style={{ flexGrow: 1, minHeight: 0 }}>
            <div style={{
              flexGrow: 1,
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
              backgroundColor: 'var(--bg-card)'
            }}>
              {loading ? (
                <div className="loading-container">
                  <span className="spinner"></span>
                  <span>Đang tải danh sách...</span>
                </div>
              ) : tasks.length === 0 ? (
                <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
                  <Clock className="empty-state-icon" size={32} />
                  <p style={{ fontSize: '0.85rem' }}>Không có công việc nào</p>
                </div>
              ) : (
                tasks.map((task) => (
                  <div 
                    key={task.id} 
                    onClick={() => { setSelectedTask(task); setIsEditingTask(false); }}
                    style={{
                      padding: '16px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      backgroundColor: selectedTask?.id === task.id ? 'var(--primary-light)' : 'transparent',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div className="flex justify-between align-center" style={{ gap: '8px' }}>
                      <span style={{ 
                        fontWeight: '600', 
                        fontSize: '0.875rem', 
                        color: selectedTask?.id === task.id ? 'var(--primary)' : 'var(--text-main)',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        flexGrow: 1
                      }}>
                        {task.title}
                      </span>
                      {getStatusBadge(task.status)}
                    </div>
                    
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {task.description || 'Không có mô tả'}
                    </p>

                    <div className="flex justify-between align-center mt-3" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <div className="flex align-center gap-1">
                        <Calendar size={12} />
                        <span>
                          {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : 'Không thời hạn'}
                        </span>
                      </div>
                      <div>
                        {task.subtasks ? `${task.subtasks.filter((s: any) => s.isCompleted).length}/${task.subtasks.length} subtasks` : '0 subtasks'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between align-center" style={{
                padding: '12px',
                border: '1px solid var(--border-color)',
                borderTop: 'none',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                backgroundColor: 'var(--bg-card)',
                fontSize: '0.8rem'
              }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  style={{ padding: '4px 8px' }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ color: 'var(--text-muted)' }}>Trang {page} / {totalPages} (Tổng: {total})</span>
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  style={{ padding: '4px 8px' }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Details and Subtasks */}
        <div className="card flex-col" style={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
          {selectedTask ? (
            <div className="flex flex-col gap-4" style={{ height: '100%' }}>
              
              {/* Task Header & Info */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', flexShrink: 0 }}>
                {isEditingTask ? (
                  <form onSubmit={handleUpdateTask} className="flex flex-col gap-3">
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Tiêu đề</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={editTaskTitle} 
                        onChange={(e) => setEditTaskTitle(e.target.value)} 
                        placeholder="Tiêu đề..."
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Mô tả</label>
                      <textarea 
                        className="form-input" 
                        value={editTaskDesc} 
                        onChange={(e) => setEditTaskDesc(e.target.value)} 
                        placeholder="Mô tả chi tiết..."
                        style={{ height: '60px', resize: 'none' }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Thời hạn (Deadline)</label>
                        <input 
                          type="datetime-local" 
                          className="form-input" 
                          value={editTaskDeadline} 
                          onChange={(e) => setEditTaskDeadline(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Trạng thái</label>
                        <select 
                          className="form-input" 
                          value={editTaskStatus} 
                          onChange={(e) => setEditTaskStatus(e.target.value)}
                        >
                          <option value="PENDING">Chờ xử lý (Pending)</option>
                          <option value="IN_PROGRESS">Đang làm (In Progress)</option>
                          <option value="COMPLETED">Hoàn thành (Completed)</option>
                          <option value="CANCELLED">Đã hủy (Cancelled)</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="submit" className="btn btn-primary btn-sm">Lưu thay đổi</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditingTask(false)}>Hủy</button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <div className="flex justify-between align-start" style={{ gap: '16px' }}>
                      <div>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }}>{selectedTask.title}</h2>
                        {getStatusBadge(selectedTask.status)}
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={startEditingTask}>
                          <Edit2 size={12} />
                          <span>Chỉnh sửa</span>
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={(e) => handleDeleteTask(selectedTask.id, e)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '12px', whiteSpace: 'pre-wrap' }}>
                      {selectedTask.description || 'Chưa có mô tả chi tiết cho công việc này.'}
                    </p>
                    <div className="flex gap-4 mt-4" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <div className="flex align-center gap-1">
                        <Calendar size={14} />
                        <span>Thời hạn: {selectedTask.deadline ? new Date(selectedTask.deadline).toLocaleString('vi-VN') : 'Không thời hạn'}</span>
                      </div>
                      <div>
                        Tạo ngày: {new Date(selectedTask.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Subtasks Section */}
              <div className="flex flex-col" style={{ flexGrow: 1, minHeight: 0 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '12px' }}>
                  Nhiệm vụ phụ (Subtasks) ({selectedTask.subtasks ? selectedTask.subtasks.filter((s: any) => s.isCompleted).length : 0}/{selectedTask.subtasks ? selectedTask.subtasks.length : 0})
                </h3>

                {/* Subtask List */}
                <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '4px' }} className="flex flex-col gap-2">
                  {(!selectedTask.subtasks || selectedTask.subtasks.length === 0) ? (
                    <div className="empty-state" style={{ padding: '32px' }}>
                      <CheckCircle2 className="empty-state-icon" size={24} />
                      <p style={{ fontSize: '0.85rem' }}>Chưa có nhiệm vụ phụ nào. Hãy nhập ở phía dưới để thêm mới.</p>
                    </div>
                  ) : (
                    selectedTask.subtasks.map((subtask: any) => (
                      <div 
                        key={subtask.id} 
                        style={{
                          padding: '12px 16px',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-app)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'between',
                          gap: '12px',
                          transition: 'all 0.15s ease'
                        }}
                        className="card-hover"
                      >
                        <button 
                          onClick={() => handleToggleSubtask(subtask)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: subtask.isCompleted ? 'var(--success)' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          {subtask.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </button>

                        <div style={{ flexGrow: 1 }}>
                          {editingSubtaskId === subtask.id ? (
                            <div className="flex gap-2" style={{ width: '100%' }}>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ flexGrow: 1 }} 
                                value={editSubtaskTitle}
                                onChange={(e) => setEditSubtaskTitle(e.target.value)}
                              />
                              <input 
                                type="date" 
                                className="form-input" 
                                style={{ width: '130px' }}
                                value={editSubtaskDeadline}
                                onChange={(e) => setEditSubtaskDeadline(e.target.value)}
                              />
                              <button className="btn btn-primary btn-sm" onClick={() => handleUpdateSubtask(subtask.id)}>
                                <Check size={14} />
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditingSubtaskId(null)}>
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <span style={{ 
                                fontSize: '0.875rem', 
                                textDecoration: subtask.isCompleted ? 'line-through' : 'none',
                                color: subtask.isCompleted ? 'var(--text-muted)' : 'var(--text-main)',
                                fontWeight: '500'
                              }}>
                                {subtask.title}
                              </span>
                              {subtask.deadline && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                  <Calendar size={10} />
                                  <span>Hạn chót: {new Date(subtask.deadline).toLocaleDateString('vi-VN')}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {editingSubtaskId !== subtask.id && (
                          <div className="flex gap-2" style={{ flexShrink: 0 }}>
                            <button 
                              onClick={() => startEditingSubtask(subtask)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            >
                              Sửa
                            </button>
                            <button 
                              onClick={() => handleDeleteSubtask(subtask.id)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Subtask Inline Form */}
                <form onSubmit={handleAddSubtaskInline} className="flex gap-2 mt-3" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', flexShrink: 0 }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ flexGrow: 1 }} 
                    placeholder="Tên nhiệm vụ phụ mới..." 
                    required
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  />
                  <input 
                    type="date" 
                    className="form-input" 
                    style={{ width: '140px' }}
                    value={newSubtaskDeadline}
                    onChange={(e) => setNewSubtaskDeadline(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary">
                    <Plus size={16} />
                    <span>Thêm</span>
                  </button>
                </form>
              </div>

            </div>
          ) : (
            <div className="empty-state" style={{ margin: 'auto', border: 'none' }}>
              <Clock size={48} className="empty-state-icon" />
              <h3 style={{ marginTop: '16px', fontSize: '1.1rem' }}>Không có công việc nào được chọn</h3>
              <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Hãy chọn một công việc từ danh sách bên trái hoặc tạo công việc mới để bắt đầu quản lý</p>
            </div>
          )}
        </div>
      </div>

      {/* Modern Modal Create Task */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Tạo Công Việc Mới</h3>
              <button className="hamburger-btn" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tiêu đề công việc <span className="form-required">*</span></label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Nhập tiêu đề công việc..." 
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả chi tiết</label>
                  <textarea 
                    className="form-input" 
                    placeholder="Mô tả nội dung công việc..." 
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    style={{ height: '70px', resize: 'none' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Thời hạn (Deadline)</label>
                  <input 
                    type="datetime-local" 
                    className="form-input" 
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                  />
                </div>

                {/* Subtasks in Modal */}
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>Nhiệm vụ phụ khởi tạo (Tùy chọn)</h4>
                  
                  {newTaskSubtasks.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      {newTaskSubtasks.map((st, i) => (
                        <div key={i} className="flex justify-between align-center" style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--bg-app)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          <span style={{ fontSize: '0.8rem' }}>{st.title}</span>
                          <div className="flex align-center gap-3">
                            {st.deadline && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hạn: {new Date(st.deadline).toLocaleDateString('vi-VN')}</span>}
                            <button type="button" onClick={() => handleRemoveTempSubtask(i)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }}>
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ flexGrow: 1 }}
                      placeholder="Tên nhiệm vụ phụ..."
                      value={tempSubtaskTitle}
                      onChange={(e) => setTempSubtaskTitle(e.target.value)}
                    />
                    <input 
                      type="date" 
                      className="form-input" 
                      style={{ width: '130px' }}
                      value={tempSubtaskDeadline}
                      onChange={(e) => setTempSubtaskDeadline(e.target.value)}
                    />
                    <button type="button" className="btn btn-secondary" onClick={handleAddTempSubtask}>
                      Thêm
                    </button>
                  </div>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Tạo mới</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Component */}
      {confirmDialog && confirmDialog.show && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="flex align-center gap-2" style={{ color: 'var(--danger)' }}>
                <AlertCircle size={20} />
                <h3 style={{ margin: 0 }}>{confirmDialog.title}</h3>
              </div>
            </div>
            <div className="modal-body" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {confirmDialog.message}
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', backgroundColor: 'transparent' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDialog(null)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleConfirmAction}>Đồng ý</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
