import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Plus, Search, Pin, Trash2, 
  PlusCircle, FolderOpen, AlertCircle, X
} from 'lucide-react';

export const Notes: React.FC = () => {
  const [notes, setNotes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  // Forms
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newTags, setNewTags] = useState('');
  
  const [blockType, setBlockType] = useState('TEXT');
  const [blockContent, setBlockContent] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Debouncing Search Input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/notes');
      setNotes(data);
      if (data.length > 0 && !selectedNote) {
        setSelectedNote(data[0]);
      } else if (selectedNote) {
        const updatedSelected = data.find((n: any) => n.id === selectedNote.id);
        if (updatedSelected) setSelectedNote(updatedSelected);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);
      const newNote = await api.post('/api/notes', {
        title: newTitle,
        summary: newSummary,
        tags: tagsArray,
        isPinned: false
      });
      setNewTitle('');
      setNewSummary('');
      setNewTags('');
      setShowAddForm(false);
      await loadNotes();
      setSelectedNote(newNote);
    } catch (err) {
      alert('Tạo ghi chú thất bại');
    }
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

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm(
      'Xóa ghi chú',
      'Bạn có chắc chắn muốn xóa ghi chú này? Thao tác này không thể hoàn tác.',
      async () => {
        try {
          await api.delete(`/api/notes/${id}`);
          if (selectedNote?.id === id) {
            setSelectedNote(null);
          }
          await loadNotes();
        } catch (err) {
          alert('Xóa thất bại');
        }
      }
    );
  };

  const handlePinNote = async (note: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch(`/api/notes/${note.id}`, {
        isPinned: !note.isPinned
      });
      await loadNotes();
    } catch (err) {
      alert('Cập nhật thất bại');
    }
  };

  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !blockContent.trim()) return;

    try {
      const nextIndex = (selectedNote.noteBlocks || []).length + 1;
      await api.post(`/api/notes/${selectedNote.id}/blocks`, {
        type: blockType,
        content: blockContent,
        orderIndex: nextIndex
      });
      setBlockContent('');
      await loadNotes();
    } catch (err) {
      alert('Thêm khối nội dung thất bại');
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    showConfirm(
      'Xóa khối nội dung',
      'Bạn có muốn xóa phần nội dung này khỏi ghi chú?',
      async () => {
        try {
          await api.delete(`/api/notes/blocks/${blockId}`);
          await loadNotes();
        } catch (err) {
          alert('Xóa khối nội dung thất bại');
        }
      }
    );
  };

  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
    note.summary.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
  );

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <header className="flex justify-between align-center mb-4" style={{ flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Workspace Ghi chú</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Quản lý ý tưởng và tài liệu dự án trực quan</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
          <Plus size={16} />
          <span>Tạo ghi chú</span>
        </button>
      </header>

      {/* Main Workspace */}
      <div className="flex gap-6 mt-4" style={{ flexGrow: 1, minHeight: 0, alignItems: 'stretch' }}>
        {/* Left column: List */}
        <div className="flex flex-col gap-4" style={{ width: '320px', flexShrink: 0, height: '100%' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-input" 
              style={{ width: '100%', paddingLeft: '36px' }} 
              placeholder="Tìm ghi chú..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ flexGrow: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-card)' }}>
            {loading ? (
              <div className="loading-container">
                <span className="spinner"></span>
                <span>Đang tải ghi chú...</span>
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
                <FolderOpen className="empty-state-icon" size={32} />
                <p style={{ fontSize: '0.85rem' }}>Không tìm thấy kết quả</p>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div 
                  key={note.id} 
                  onClick={() => setSelectedNote(note)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    backgroundColor: selectedNote?.id === note.id ? 'var(--primary-light)' : 'transparent',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <div className="flex justify-between align-center">
                    <span style={{ fontWeight: '600', fontSize: '0.875rem', color: selectedNote?.id === note.id ? 'var(--primary)' : 'var(--text-main)', paddingRight: '40px' }}>
                      {note.title}
                    </span>
                    <div className="flex gap-2" style={{ position: 'absolute', right: '16px', top: '16px' }}>
                      <button 
                        onClick={(e) => handlePinNote(note, e)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: note.isPinned ? 'var(--primary)' : 'var(--text-muted)' }}
                      >
                        <Pin size={14} fill={note.isPinned ? 'currentColor' : 'none'} />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteNote(note.id, e)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {note.summary || 'Không có mô tả'}
                  </p>
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
                      {note.tags.map((tag: string) => (
                        <span key={tag} className="badge badge-info btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Editor details */}
        <div className="card flex-col" style={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
          {selectedNote ? (
            <div className="flex flex-col gap-4" style={{ height: '100%' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{selectedNote.title}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{selectedNote.summary || 'Chưa thêm mô tả tóm tắt.'}</p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Tạo ngày: {new Date(selectedNote.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>

              {/* Blocks rendering */}
              <div className="flex flex-col gap-4" style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '8px' }}>
                {(selectedNote.noteBlocks || []).length === 0 ? (
                  <div className="empty-state" style={{ padding: '32px' }}>
                    <PlusCircle className="empty-state-icon" size={24} />
                    <p style={{ fontSize: '0.85rem' }}>Ghi chú này chưa có nội dung. Hãy bắt đầu nhập văn bản hoặc code ở phía dưới.</p>
                  </div>
                ) : (
                  (selectedNote.noteBlocks || []).map((block: any) => (
                    <div key={block.id} className="flex justify-between card-hover" style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border-color)',
                      transition: 'all 0.15s ease'
                    }}>
                      <div style={{ flexGrow: 1 }}>
                        {block.type === 'TEXT' && <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{block.content}</p>}
                        {block.type === 'CODE' && (
                          <pre style={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            backgroundColor: 'var(--bg-card)',
                            padding: '12px',
                            borderRadius: 'var(--radius-sm)',
                            overflowX: 'auto',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-main)'
                          }}>{block.content}</pre>
                        )}
                        {block.type === 'CHECKLIST' && (
                          <div className="flex align-center gap-2">
                            <input type="checkbox" readOnly checked style={{ accentColor: 'var(--primary)' }} />
                            <span style={{ fontSize: '0.9rem' }}>{block.content}</span>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => handleDeleteBlock(block.id)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', marginLeft: '16px', alignSelf: 'flex-start' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add block Form */}
              <form onSubmit={handleAddBlock} className="flex gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', flexShrink: 0 }}>
                <select 
                  className="form-input" 
                  value={blockType} 
                  onChange={(e) => setBlockType(e.target.value)}
                  style={{ width: '120px' }}
                >
                  <option value="TEXT">Văn bản</option>
                  <option value="CODE">Mã nguồn</option>
                  <option value="CHECKLIST">Công việc</option>
                </select>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ flexGrow: 1 }} 
                  placeholder="Nhập nội dung khối..." 
                  required
                  value={blockContent}
                  onChange={(e) => setBlockContent(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  <PlusCircle size={16} />
                  <span>Thêm</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="empty-state" style={{ margin: 'auto', border: 'none' }}>
              <FolderOpen size={48} className="empty-state-icon" />
              <h3 style={{ marginTop: '16px', fontSize: '1.1rem' }}>Không có ghi chú nào được chọn</h3>
              <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Hãy chọn hoặc tạo một ghi chú mới ở danh sách bên trái để bắt đầu làm việc</p>
            </div>
          )}
        </div>
      </div>

      {/* Modern Modal Add Note Form */}
      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Thêm Ghi Chú Mới</h3>
              <button className="hamburger-btn" onClick={() => setShowAddForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateNote}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tiêu đề <span className="form-required">*</span></label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Nhập tiêu đề..." 
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tóm tắt ngắn</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Tóm tắt ngắn nội dung..." 
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Nhãn (cách nhau bằng dấu phẩy)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="nestjs, tailwind, ideas" 
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Tạo mới</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirm Dialog Component */}
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
