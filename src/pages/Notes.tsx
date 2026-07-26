import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Plus, Search, Pin, Trash2, 
  PlusCircle, FolderOpen
} from 'lucide-react';

export const Notes: React.FC = () => {
  const [notes, setNotes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  
  // Forms
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newTags, setNewTags] = useState('');
  
  const [blockType, setBlockType] = useState('TEXT');
  const [blockContent, setBlockContent] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const loadNotes = async () => {
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

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bạn có muốn xóa ghi chú này?')) return;
    try {
      await api.delete(`/api/notes/${id}`);
      if (selectedNote?.id === id) {
        setSelectedNote(null);
      }
      await loadNotes();
    } catch (err) {
      alert('Xóa thất bại');
    }
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
    try {
      await api.delete(`/api/notes/blocks/${blockId}`);
      await loadNotes();
    } catch (err) {
      alert('Xóa khối nội dung thất bại');
    }
  };

  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <header className="flex justify-between align-center mb-4">
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Workspace Ghi chú</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Quản lý ý tưởng và tài liệu dự án</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={16} />
          <span>Tạo ghi chú</span>
        </button>
      </header>

      {showAddForm && (
        <form onSubmit={handleCreateNote} className="card flex flex-col gap-4 mb-4" style={{ maxWidth: '500px' }}>
          <h3>Ghi chú mới</h3>
          <div className="form-group">
            <label className="form-label">Tiêu đề</label>
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
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Lưu lại</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Hủy</button>
          </div>
        </form>
      )}

      {/* Main Workspace Workspace */}
      <div className="flex gap-6 mt-4" style={{ height: 'calc(100vh - 180px)', alignItems: 'stretch' }}>
        {/* Left column: List */}
        <div className="flex flex-col gap-4" style={{ width: '320px', flexShrink: 0 }}>
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
            {filteredNotes.length === 0 ? (
              <p style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>Không tìm thấy kết quả</p>
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
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="flex justify-between align-center">
                    <span style={{ fontWeight: '600', fontSize: '0.875rem', color: selectedNote?.id === note.id ? 'var(--primary)' : 'var(--text-main)' }}>
                      {note.title}
                    </span>
                    <div className="flex gap-2">
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
        <div className="card flex-col" style={{ flexGrow: 1, display: 'flex', overflowY: 'auto' }}>
          {selectedNote ? (
            <div className="flex flex-col gap-4" style={{ height: '100%' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{selectedNote.title}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{selectedNote.summary || 'Chưa thêm mô tả tóm tắt.'}</p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Tạo ngày: {new Date(selectedNote.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>

              {/* Blocks rendering */}
              <div className="flex flex-col gap-4" style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '8px' }}>
                {(selectedNote.noteBlocks || []).map((block: any) => (
                  <div key={block.id} className="flex justify-between" style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ flexGrow: 1 }}>
                      {block.type === 'TEXT' && <p style={{ fontSize: '0.9rem' }}>{block.content}</p>}
                      {block.type === 'CODE' && (
                        <pre style={{
                          fontFamily: 'var(--mono)',
                          fontSize: '0.8rem',
                          backgroundColor: 'var(--bg-card)',
                          padding: '12px',
                          borderRadius: 'var(--radius-sm)',
                          overflowX: 'auto',
                          border: '1px solid var(--border-color)'
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
                ))}
              </div>

              {/* Add block Form */}
              <form onSubmit={handleAddBlock} className="flex gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
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
            <div className="flex flex-col align-center justify-between" style={{ margin: 'auto', padding: '40px', color: 'var(--text-muted)' }}>
              <FolderOpen size={48} />
              <p style={{ marginTop: '16px' }}>Hãy chọn hoặc tạo một ghi chú mới để làm việc</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
