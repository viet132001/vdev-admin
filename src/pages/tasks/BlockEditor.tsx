import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  GripVertical, Type, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Code, Lightbulb, Minus,
  ArrowUp, ArrowDown, Copy, Trash2
} from 'lucide-react';
import { Popover } from './shared';

// Task page content is stored as `{ blocks: Block[] }` in Task.content (see tasks-api.md)
export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bulleted' | 'numbered' | 'todo' | 'quote' | 'code' | 'callout' | 'divider';

const BLOCK_TYPES: { value: BlockType; label: string; hint: string; icon: React.FC<{ size?: number }> }[] = [
  { value: 'paragraph', label: 'Văn bản', hint: 'text', icon: Type },
  { value: 'h1', label: 'Tiêu đề 1', hint: '#', icon: Heading1 },
  { value: 'h2', label: 'Tiêu đề 2', hint: '##', icon: Heading2 },
  { value: 'h3', label: 'Tiêu đề 3', hint: '###', icon: Heading3 },
  { value: 'bulleted', label: 'Danh sách', hint: '-', icon: List },
  { value: 'numbered', label: 'Danh sách số', hint: '1.', icon: ListOrdered },
  { value: 'todo', label: 'Việc cần làm', hint: '[]', icon: ListTodo },
  { value: 'quote', label: 'Trích dẫn', hint: '>', icon: Quote },
  { value: 'code', label: 'Code', hint: '```', icon: Code },
  { value: 'callout', label: 'Ghi chú nổi bật', hint: 'callout', icon: Lightbulb },
  { value: 'divider', label: 'Đường kẻ', hint: '---', icon: Minus }
];

const MARKDOWN_SHORTCUTS: [string, BlockType][] = [
  ['### ', 'h3'], ['## ', 'h2'], ['# ', 'h1'], ['- ', 'bulleted'], ['* ', 'bulleted'], ['1. ', 'numbered'],
  ['[] ', 'todo'], ['[ ] ', 'todo'], ['> ', 'quote'], ['```', 'code'], ['---', 'divider']
];

const CONTINUING_TYPES: BlockType[] = ['bulleted', 'numbered', 'todo'];
const PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  paragraph: "Gõ '/' để chọn loại khối, hoặc Markdown (#, -, [], >)...",
  h1: 'Tiêu đề 1', h2: 'Tiêu đề 2', h3: 'Tiêu đề 3', todo: 'Việc cần làm', quote: 'Trích dẫn', code: 'Code', callout: 'Ghi chú'
};

const genId = () => Math.random().toString(36).substring(2, 10);
const newBlock = (type: BlockType = 'paragraph', text = ''): Block => ({ id: genId(), type, text, ...(type === 'todo' ? { checked: false } : {}) });

// Accepts whatever the server holds and normalises it into blocks
export const parseContent = (content: any): Block[] => {
  const blocks = content && Array.isArray(content.blocks) ? content.blocks : [];
  return blocks
    .filter((b: any) => b && typeof b === 'object')
    .map((b: any) => ({ id: b.id || genId(), type: (BLOCK_TYPES.some((t) => t.value === b.type) ? b.type : 'paragraph') as BlockType, text: String(b.text ?? ''), ...(b.type === 'todo' ? { checked: !!b.checked } : {}) }));
};

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({ blocks: rawBlocks, onChange }) => {
  // A stable placeholder block so an empty page is still typeable without remounting on first keystroke
  const placeholderId = useRef(genId());
  const blocks: Block[] = rawBlocks.length ? rawBlocks : [{ id: placeholderId.current, type: 'paragraph', text: '' }];
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [focus, setFocus] = useState<{ id: string; caret: number } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [slash, setSlash] = useState<{ id: string; index: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [draggableId, setDraggableId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!focus) return;
    const el = refs.current[focus.id];
    if (el) {
      el.focus();
      const caret = Math.min(focus.caret, el.value.length);
      el.setSelectionRange(caret, caret);
    }
    setFocus(null);
  }, [focus]);

  // Keep every textarea sized to its content
  useEffect(() => {
    Object.values(refs.current).forEach((el) => autoResize(el));
  });

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const commit = (next: Block[]) => onChange(next.length === 1 && next[0].type === 'paragraph' && !next[0].text ? [] : next);

  const update = (id: string, patch: Partial<Block>) => commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const changeType = (id: string, type: BlockType, text?: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    const current = blocks[index];
    const replaced: Block = { ...current, type, text: text ?? current.text, ...(type === 'todo' ? { checked: !!current.checked } : {}) };
    const next = [...blocks];
    next[index] = replaced;
    if (type === 'divider') {
      replaced.text = '';
      const after = newBlock();
      next.splice(index + 1, 0, after);
      setFocus({ id: after.id, caret: 0 });
    } else {
      setFocus({ id: replaced.id, caret: replaced.text.length });
    }
    commit(next);
  };

  const handleTextChange = (block: Block, value: string) => {
    if (block.type === 'paragraph') {
      const shortcut = MARKDOWN_SHORTCUTS.find(([prefix]) => value.startsWith(prefix));
      if (shortcut) {
        changeType(block.id, shortcut[1], value.slice(shortcut[0].length));
        return;
      }
    }
    if (value.startsWith('/') && !value.includes(' ')) setSlash({ id: block.id, index: 0 });
    else if (slash?.id === block.id) setSlash(null);
    update(block.id, { text: value });
  };

  const slashOptions = (block: Block) => {
    const q = block.text.slice(1).toLowerCase();
    return BLOCK_TYPES.filter((t) => !q || t.label.toLowerCase().includes(q) || t.value.includes(q) || t.hint.includes(q));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;

    if (slash?.id === block.id) {
      const options = slashOptions(block);
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlash({ ...slash, index: (slash.index + 1) % Math.max(options.length, 1) }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlash({ ...slash, index: (slash.index - 1 + options.length) % Math.max(options.length, 1) }); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
      if (e.key === 'Enter' && options.length > 0) {
        e.preventDefault();
        setSlash(null);
        changeType(block.id, options[Math.min(slash.index, options.length - 1)].value, '');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      if (CONTINUING_TYPES.includes(block.type) && block.text === '') {
        changeType(block.id, 'paragraph');
        return;
      }
      const before = block.text.slice(0, el.selectionStart);
      const after = block.text.slice(el.selectionEnd);
      const created = newBlock(CONTINUING_TYPES.includes(block.type) ? block.type : 'paragraph', after);
      const next = [...blocks];
      next[index] = { ...block, text: before };
      next.splice(index + 1, 0, created);
      commit(next);
      setFocus({ id: created.id, caret: 0 });
      return;
    }

    if (e.key === 'Backspace' && atStart) {
      if (block.type !== 'paragraph') {
        e.preventDefault();
        changeType(block.id, 'paragraph');
        return;
      }
      if (index > 0) {
        e.preventDefault();
        const prev = blocks[index - 1];
        if (prev.type === 'divider') {
          commit(blocks.filter((b) => b.id !== prev.id));
          setFocus({ id: block.id, caret: 0 });
          return;
        }
        commit(blocks.filter((b) => b.id !== block.id).map((b) => (b.id === prev.id ? { ...b, text: b.text + block.text } : b)));
        setFocus({ id: prev.id, caret: prev.text.length });
      }
      return;
    }

    if (e.key === 'ArrowUp' && atStart && index > 0) {
      const prev = blocks.slice(0, index).reverse().find((b) => b.type !== 'divider');
      if (prev) { e.preventDefault(); setFocus({ id: prev.id, caret: prev.text.length }); }
    }
    if (e.key === 'ArrowDown' && el.selectionStart === el.value.length && index < blocks.length - 1) {
      const next = blocks.slice(index + 1).find((b) => b.type !== 'divider');
      if (next) { e.preventDefault(); setFocus({ id: next.id, caret: 0 }); }
    }
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const moving = blocks.find((b) => b.id === dragId);
    if (!moving) return;
    const rest = blocks.filter((b) => b.id !== dragId);
    rest.splice(rest.findIndex((b) => b.id === targetId), 0, moving);
    commit(rest);
  };

  const numberOf = (index: number) => {
    let n = 1;
    for (let i = index - 1; i >= 0 && blocks[i].type === 'numbered'; i--) n++;
    return n;
  };

  return (
    <div className="tw-blocks">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className="tw-block"
          draggable={draggableId === block.id}
          onDragStart={() => setDragId(block.id)}
          onDragEnd={() => { setDragId(null); setDraggableId(null); }}
          onDragOver={(e) => { if (dragId) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); dropOn(block.id); }}
          style={{ opacity: dragId === block.id ? 0.4 : 1 }}
        >
          <button
            className="icon-btn tw-block-handle"
            title="Kéo để di chuyển, bấm để mở menu"
            onMouseDown={() => setDraggableId(block.id)}
            onMouseUp={() => setDraggableId(null)}
            onClick={() => setMenuFor(menuFor === block.id ? null : block.id)}
          >
            <GripVertical size={14} />
          </button>

          {block.type === 'bulleted' && <span className="tw-block-marker">•</span>}
          {block.type === 'numbered' && <span className="tw-block-marker">{numberOf(index)}.</span>}
          {block.type === 'todo' && (
            <input
              type="checkbox"
              checked={!!block.checked}
              onChange={(e) => update(block.id, { checked: e.target.checked })}
              style={{ marginTop: '8px', width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
            />
          )}

          {block.type === 'divider' ? (
            <hr className="tw-divider" style={{ flexGrow: 1, margin: '14px 0' }} />
          ) : (
            <textarea
              ref={(el) => { refs.current[block.id] = el; autoResize(el); }}
              rows={1}
              className={`tw-block-input ${block.type} ${block.type === 'todo' && block.checked ? 'done' : ''}`}
              value={block.text}
              placeholder={PLACEHOLDERS[block.type] && (blocks.length === 1 || block.type !== 'paragraph') ? PLACEHOLDERS[block.type] : ''}
              spellCheck={block.type !== 'code'}
              onChange={(e) => handleTextChange(block, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, block, index)}
              onBlur={() => setSlash((s) => (s?.id === block.id ? null : s))}
            />
          )}

          {slash?.id === block.id && (
            <Popover onClose={() => setSlash(null)} style={{ top: '100%', left: 28, maxHeight: 280, overflowY: 'auto' }}>
              {slashOptions(block).length === 0 && <div style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Không tìm thấy</div>}
              {slashOptions(block).map((t, i) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    className="tw-popover-item"
                    style={{ backgroundColor: i === slash.index ? 'var(--bg-sidebar)' : undefined }}
                    onMouseDown={(e) => { e.preventDefault(); setSlash(null); changeType(block.id, t.value, ''); }}
                  >
                    <Icon size={14} /> {t.label}
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.hint}</span>
                  </button>
                );
              })}
            </Popover>
          )}

          {menuFor === block.id && (
            <Popover onClose={() => setMenuFor(null)} style={{ top: 28, left: 0, maxHeight: 360, overflowY: 'auto' }}>
              <div style={{ padding: '4px 10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Chuyển thành</div>
              {BLOCK_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.value} className="tw-popover-item" onClick={() => { setMenuFor(null); changeType(block.id, t.value); }}>
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
              <hr className="tw-divider" style={{ margin: '4px 0' }} />
              <button className="tw-popover-item" onClick={() => { setMenuFor(null); moveBlock(block.id, -1); }}><ArrowUp size={14} /> Lên trên</button>
              <button className="tw-popover-item" onClick={() => { setMenuFor(null); moveBlock(block.id, 1); }}><ArrowDown size={14} /> Xuống dưới</button>
              <button
                className="tw-popover-item"
                onClick={() => {
                  setMenuFor(null);
                  const next = [...blocks];
                  next.splice(index + 1, 0, { ...block, id: genId() });
                  commit(next);
                }}
              >
                <Copy size={14} /> Nhân bản
              </button>
              <button className="tw-popover-item danger" onClick={() => { setMenuFor(null); commit(blocks.filter((b) => b.id !== block.id)); }}>
                <Trash2 size={14} /> Xóa khối
              </button>
            </Popover>
          )}
        </div>
      ))}
    </div>
  );
};
