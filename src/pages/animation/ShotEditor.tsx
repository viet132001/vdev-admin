import React from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, Loader2, Trash2 } from 'lucide-react';
import { ACTION_LABEL, CAMERA_LABEL, EXPRESSION_LABEL, MOVE_LABEL, type AnimationCatalog, type ScriptShot } from './animationWorker';

const faceName = (name: string) => EXPRESSION_LABEL[name] ?? name;

interface ShotEditorProps {
  index: number;
  shot: ScriptShot;
  catalog: AnimationCatalog;
  disabled: boolean;
  first: boolean;
  last: boolean;
  preview: string | undefined;
  previewing: boolean;
  onChange: (shot: ScriptShot) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
}

// One shot of the script: who is on stage, who talks and with which face, what they say, how the camera looks
export const ShotEditor: React.FC<ShotEditorProps> = ({ index, shot, catalog, disabled, first, last, preview, previewing, onChange, onMove, onDuplicate, onDelete, onPreview }) => {
  const person = (id: string) => catalog.characters.find((c) => c.id === id);
  const facesOf = (id: string) => person(id)?.expressions ?? ['neutral'];

  const toggleCast = (id: string, on: boolean) => {
    const cast = on ? [...shot.cast, { character: id, x: shot.cast.length ? 0.7 : 0.3, face: (shot.cast.length ? -1 : 1) as 1 | -1 }] : shot.cast.filter((m) => m.character !== id);
    const speaker = shot.speaker && cast.some((m) => m.character === shot.speaker) ? shot.speaker : null;
    onChange({ ...shot, cast, speaker, reactions: shot.reactions.filter((r) => cast.some((m) => m.character === r.character)), camera: speaker ? shot.camera : 'wide' });
  };
  const setMember = (id: string, patch: Partial<ScriptShot['cast'][number]>) => onChange({ ...shot, cast: shot.cast.map((m) => (m.character === id ? { ...m, ...patch } : m)) });
  const setSpeaker = (id: string) => {
    const speaker = id || null;
    onChange({ ...shot, speaker, text: speaker ? shot.text : '', expression: speaker && !facesOf(speaker).includes(shot.expression) ? 'neutral' : shot.expression, camera: speaker ? shot.camera : 'wide', reactions: shot.reactions.filter((r) => r.character !== speaker) });
  };
  const reactionOf = (id: string) => shot.reactions.find((r) => r.character === id)?.expression ?? 'neutral';
  const setReaction = (id: string, expression: string) => onChange({ ...shot, reactions: [...shot.reactions.filter((r) => r.character !== id), { character: id, expression }] });

  return (
    <div className="st-line">
      <div className="st-line-head">
        <span className="st-line-no">{index + 1}</span>
        <select className="form-input" value={shot.background} disabled={disabled} onChange={(e) => onChange({ ...shot, background: e.target.value })} aria-label="Bối cảnh">
          {!catalog.backgrounds.some((b) => b.id === shot.background) && <option value={shot.background}>{shot.background} (chưa có ảnh)</option>}
          {catalog.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
        </select>
        <span className="lg-meta">{shot.cast.length} nhân vật{shot.props.length ? ` · ${shot.props.length} đạo cụ` : ''}</span>
        <div className="st-line-tools">
          <button className="icon-btn" title="Lên" disabled={disabled || first} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
          <button className="icon-btn" title="Xuống" disabled={disabled || last} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
          <button className="icon-btn" title="Nhân đôi" disabled={disabled} onClick={onDuplicate}><Copy size={14} /></button>
          <button className="icon-btn" title="Xoá shot" disabled={disabled} onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="st-fields">
        <label>Camera
          <select className="form-input" value={shot.camera} disabled={disabled || !shot.speaker} onChange={(e) => onChange({ ...shot, camera: e.target.value as ScriptShot['camera'] })}>
            {Object.entries(CAMERA_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Chuyển động camera
          <select className="form-input" value={shot.move} disabled={disabled} onChange={(e) => onChange({ ...shot, move: e.target.value })}>
            {Object.entries(MOVE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Người nói
          <select className="form-input" value={shot.speaker ?? ''} disabled={disabled} onChange={(e) => setSpeaker(e.target.value)}>
            <option value="">(im lặng)</option>
            {shot.cast.map((m) => <option key={m.character} value={m.character}>{person(m.character)?.name ?? m.character}</option>)}
          </select>
        </label>
        <label>Biểu cảm người nói
          <select className="form-input" value={shot.expression} disabled={disabled || !shot.speaker} onChange={(e) => onChange({ ...shot, expression: e.target.value })}>
            {facesOf(shot.speaker ?? '').map((name) => <option key={name} value={name}>{faceName(name)}</option>)}
          </select>
        </label>
        <label>Cử động
          <select className="form-input" value={shot.action} disabled={disabled || !shot.speaker} onChange={(e) => onChange({ ...shot, action: e.target.value })}>
            {Object.entries(ACTION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="st-blocking" style={{ marginTop: 8 }}>
        {catalog.characters.map((c) => {
          const member = shot.cast.find((m) => m.character === c.id);
          return (
            <div key={c.id} className="flex align-center gap-3" style={{ flexWrap: 'wrap' }}>
              <label className="flex align-center gap-2" style={{ minWidth: 110 }}>
                <input type="checkbox" checked={!!member} disabled={disabled} onChange={(e) => toggleCast(c.id, e.target.checked)} /> {c.name}
              </label>
              {member && (
                <>
                  <label className="flex align-center gap-2 lg-meta">Vị trí
                    <input type="range" min={0.1} max={0.9} step={0.05} value={member.x} disabled={disabled} onChange={(e) => setMember(c.id, { x: Number(e.target.value) })} />
                  </label>
                  <select className="form-input" style={{ width: 'auto' }} value={member.face} disabled={disabled} onChange={(e) => setMember(c.id, { face: Number(e.target.value) as 1 | -1 })} aria-label="Hướng nhìn">
                    <option value={1}>Nhìn phải</option>
                    <option value={-1}>Nhìn trái</option>
                  </select>
                  {c.id !== shot.speaker && (
                    <select className="form-input" style={{ width: 'auto' }} value={reactionOf(c.id)} disabled={disabled} onChange={(e) => setReaction(c.id, e.target.value)} aria-label="Biểu cảm khi nghe">
                      {c.expressions.map((name) => <option key={name} value={name}>Nghe: {faceName(name)}</option>)}
                    </select>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="form-group" style={{ margin: '8px 0 0' }}>
        <textarea className="form-input" rows={2} maxLength={240} value={shot.text} disabled={disabled || !shot.speaker} placeholder={shot.speaker ? 'Lời thoại' : 'Chọn người nói để viết lời'} onChange={(e) => onChange({ ...shot, text: e.target.value })} />
      </div>

      <div className="flex align-center gap-3" style={{ marginTop: 8 }}>
        <button className="btn btn-secondary btn-sm" disabled={previewing} onClick={onPreview}>{previewing ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} Xem thử</button>
      </div>
      {preview && <img className="st-preview" src={preview} alt={`Xem thử shot ${index + 1}`} />}
    </div>
  );
};
