import React from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  ACTION_LABEL, CAMERA_LABEL, EFFECT_LABEL, EXPRESSION_LABEL, GESTURE_LABEL, GROUND_LINE, LIGHT_LABEL, MOVE_LABEL, NARRATOR, POSE_LABEL, TONE_LABEL, TRANSITION_LABEL,
  type AnimationCatalog, type ScriptMember, type ScriptShot
} from './animationWorker';

const faceName = (name: string) => EXPRESSION_LABEL[name] ?? name;
const MAX_CHARS = 260;
const MAX_EFFECTS = 3;
type StageProp = ScriptShot['props'][number];

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

const Options: React.FC<{ labels: Record<string, string> }> = ({ labels }) => <>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</>;

// One shot of the script: who speaks (the narrator or a character) and what, who is on stage and how they act,
// how the camera looks, and the air of the place
export const ShotEditor: React.FC<ShotEditorProps> = ({ index, shot, catalog, disabled, first, last, preview, previewing, onChange, onMove, onDuplicate, onDelete, onPreview }) => {
  const person = (id: string) => catalog.characters.find((c) => c.id === id);
  const facesOf = (id: string) => person(id)?.expressions ?? ['neutral'];
  const talker = shot.speaker && shot.speaker !== NARRATOR ? shot.speaker : null;

  const toggleCast = (id: string, on: boolean) => {
    const cast: ScriptMember[] = on
      ? [...shot.cast, { character: id, x: shot.cast.length ? 0.66 : 0.34, toX: null, face: shot.cast.length ? -1 : 1, pose: 'stand', gesture: 'none', hold: null }]
      : shot.cast.filter((m) => m.character !== id);
    const keeps = (who: string | null) => !!who && cast.some((m) => m.character === who);
    const speaker = shot.speaker === NARRATOR || keeps(shot.speaker) ? shot.speaker : null;
    onChange({ ...shot, cast, speaker, subject: keeps(shot.subject) ? shot.subject : null, reactions: shot.reactions.filter((r) => keeps(r.character)), camera: cast.length ? shot.camera : 'wide' });
  };
  const setMember = (id: string, patch: Partial<ScriptMember>) => onChange({ ...shot, cast: shot.cast.map((m) => (m.character === id ? { ...m, ...patch } : m)) });
  const setSpeaker = (id: string) => {
    const speaker = id || null;
    const character = speaker && speaker !== NARRATOR ? speaker : null;
    onChange({ ...shot, speaker, text: speaker ? shot.text : '', expression: character && !facesOf(character).includes(shot.expression) ? 'neutral' : shot.expression, reactions: shot.reactions.filter((r) => r.character !== character), action: character ? shot.action : 'none' });
  };
  const setProp = (n: number, patch: Partial<StageProp>) => onChange({ ...shot, props: shot.props.map((p, i) => (i === n ? { ...p, ...patch } : p)) });
  const addProp = () => onChange({ ...shot, props: [...shot.props, { id: catalog.props[0].id, x: 0.5, y: GROUND_LINE, scale: 0.1, layer: 'back', depth: null }] });
  const sized = (id: string) => !!catalog.props.find((p) => p.id === id)?.heightCm;
  const reactionOf = (id: string) => shot.reactions.find((r) => r.character === id)?.expression ?? 'neutral';
  const setReaction = (id: string, expression: string) => onChange({ ...shot, reactions: [...shot.reactions.filter((r) => r.character !== id), { character: id, expression }] });
  const toggleEffect = (effect: string, on: boolean) => onChange({ ...shot, effects: on ? [...shot.effects, effect] : shot.effects.filter((e) => e !== effect) });
  const setLight = (kind: string) => onChange({ ...shot, light: kind ? { kind, x: shot.light?.x ?? (kind === 'sun' || kind === 'moon' ? 0.8 : 0.5), y: shot.light?.y ?? (kind === 'sun' || kind === 'moon' ? 0.18 : 0.82) } : null });

  return (
    <div className="st-line">
      <div className="st-line-head">
        <span className="st-line-no">{index + 1}</span>
        <select className="form-input" value={shot.background} disabled={disabled} onChange={(e) => onChange({ ...shot, background: e.target.value })} aria-label="Bối cảnh">
          {!catalog.backgrounds.some((b) => b.id === shot.background) && <option value={shot.background}>{shot.background} (chưa có ảnh)</option>}
          {catalog.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.id}{b.foreground ? '' : ' (chưa có tiền cảnh)'}</option>)}
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
        <label>Người nói
          <select className="form-input" value={shot.speaker ?? ''} disabled={disabled} onChange={(e) => setSpeaker(e.target.value)}>
            <option value="">(im lặng)</option>
            <option value={NARRATOR}>Người kể chuyện</option>
            {shot.cast.map((m) => <option key={m.character} value={m.character}>{person(m.character)?.name ?? m.character}</option>)}
          </select>
        </label>
        <label>Biểu cảm người nói
          <select className="form-input" value={shot.expression} disabled={disabled || !talker} onChange={(e) => onChange({ ...shot, expression: e.target.value })}>
            {facesOf(talker ?? '').map((name) => <option key={name} value={name}>{faceName(name)}</option>)}
          </select>
        </label>
        <label>Cử động khi nói
          <select className="form-input" value={shot.action} disabled={disabled || !talker} onChange={(e) => onChange({ ...shot, action: e.target.value })}><Options labels={ACTION_LABEL} /></select>
        </label>
        <label>Khung hình
          <select className="form-input" value={shot.camera} disabled={disabled || !shot.cast.length} onChange={(e) => onChange({ ...shot, camera: e.target.value as ScriptShot['camera'] })}><Options labels={CAMERA_LABEL} /></select>
        </label>
        {shot.camera !== 'wide' && (
          <label>Quay vào
            <select className="form-input" value={shot.subject ?? ''} disabled={disabled} onChange={(e) => onChange({ ...shot, subject: e.target.value || null })}>
              <option value="">{talker ? 'Người nói' : 'Người đầu tiên'}</option>
              {shot.cast.map((m) => <option key={m.character} value={m.character}>{person(m.character)?.name ?? m.character}</option>)}
            </select>
          </label>
        )}
        <label>Chuyển động camera
          <select className="form-input" value={shot.move} disabled={disabled} onChange={(e) => onChange({ ...shot, move: e.target.value })}><Options labels={MOVE_LABEL} /></select>
        </label>
        <label>Vào shot
          <select className="form-input" value={shot.transition} disabled={disabled || first} onChange={(e) => onChange({ ...shot, transition: e.target.value as ScriptShot['transition'] })}><Options labels={TRANSITION_LABEL} /></select>
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
                    <input type="range" min={0.05} max={0.95} step={0.01} value={member.x} disabled={disabled} onChange={(e) => setMember(c.id, { x: Number(e.target.value) })} />
                  </label>
                  <label className="flex align-center gap-2 lg-meta" title="Kéo sang trái là đứng xa (vẽ nhỏ hơn), sang phải là gần máy quay">Xa ↔ gần
                    <input type="range" min={0.65} max={0.98} step={0.01} value={member.y ?? GROUND_LINE} disabled={disabled} onChange={(e) => setMember(c.id, { y: Number(e.target.value) })} />
                  </label>
                  <label className="flex align-center gap-2 lg-meta">
                    <input type="checkbox" checked={member.toX !== null} disabled={disabled} onChange={(e) => setMember(c.id, { toX: e.target.checked ? Math.min(0.95, Math.max(0.05, member.x + (member.face === 1 ? 0.25 : -0.25))) : null })} /> Đi tới
                    {member.toX !== null && <input type="range" min={0.05} max={0.95} step={0.01} value={member.toX} disabled={disabled} onChange={(e) => setMember(c.id, { toX: Number(e.target.value) })} />}
                  </label>
                  <select className="form-input" style={{ width: 'auto' }} value={member.face} disabled={disabled} onChange={(e) => setMember(c.id, { face: Number(e.target.value) as 1 | -1 })} aria-label="Hướng nhìn">
                    <option value={1}>Nhìn phải</option>
                    <option value={-1}>Nhìn trái</option>
                  </select>
                  {(c.actions?.length ?? 0) > 0 && (
                    <select className="form-input" style={{ width: 'auto' }} value={member.act ?? ''} disabled={disabled} aria-label="Hành động vẽ sẵn"
                      onChange={(e) => setMember(c.id, e.target.value ? { act: e.target.value, pose: 'stand', gesture: 'none', toX: null } : { act: null })}>
                      <option value="">Không diễn hành động</option>
                      {c.actions!.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  )}
                  {member.act && catalog.props.length > 0 && (
                    <select className="form-input" style={{ width: 'auto' }} value={member.hold ?? ''} disabled={disabled} onChange={(e) => setMember(c.id, { hold: e.target.value || null })} aria-label="Vũ khí">
                      <option value="">Tay không</option>
                      {catalog.props.map((p) => <option key={p.id} value={p.id}>Cầm: {p.id}</option>)}
                    </select>
                  )}
                  {c.rigged && !member.act && (
                    <>
                      <select className="form-input" style={{ width: 'auto' }} value={member.pose} disabled={disabled} onChange={(e) => setMember(c.id, { pose: e.target.value })} aria-label="Tư thế"><Options labels={POSE_LABEL} /></select>
                      <select className="form-input" style={{ width: 'auto' }} value={member.gesture} disabled={disabled} onChange={(e) => setMember(c.id, { gesture: e.target.value })} aria-label="Cử chỉ"><Options labels={GESTURE_LABEL} /></select>
                      {catalog.props.length > 0 && (
                        <select className="form-input" style={{ width: 'auto' }} value={member.hold ?? ''} disabled={disabled} onChange={(e) => setMember(c.id, { hold: e.target.value || null })} aria-label="Cầm">
                          <option value="">Không cầm gì</option>
                          {catalog.props.map((p) => <option key={p.id} value={p.id}>Cầm: {p.id}</option>)}
                        </select>
                      )}
                    </>
                  )}
                  {c.id !== talker && (
                    <select className="form-input" style={{ width: 'auto' }} value={reactionOf(c.id)} disabled={disabled} onChange={(e) => setReaction(c.id, e.target.value)} aria-label="Biểu cảm">
                      {c.expressions.map((name) => <option key={name} value={name}>Mặt: {faceName(name)}</option>)}
                    </select>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {(shot.props.length > 0 || catalog.props.length > 0) && (
        <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
          {shot.props.map((prop, n) => (
            <div key={n} className="flex align-center gap-3" style={{ flexWrap: 'wrap' }}>
              <select className="form-input" style={{ width: 'auto' }} value={prop.id} disabled={disabled} onChange={(e) => setProp(n, { id: e.target.value })} aria-label="Đạo cụ">
                {!catalog.props.some((p) => p.id === prop.id) && <option value={prop.id}>{prop.id} (chưa có ảnh)</option>}
                {catalog.props.map((p) => <option key={p.id} value={p.id}>{p.id}{p.heightCm ? ` (${p.heightCm} cm)` : ''}</option>)}
              </select>
              <label className="flex align-center gap-2 lg-meta">Ngang <input type="range" min={0} max={1} step={0.01} value={prop.x} disabled={disabled} onChange={(e) => setProp(n, { x: Number(e.target.value) })} /></label>
              <label className="flex align-center gap-2 lg-meta">Dọc (chân vật) <input type="range" min={0} max={1} step={0.01} value={prop.y} disabled={disabled} onChange={(e) => setProp(n, { y: Number(e.target.value) })} /></label>
              {!sized(prop.id) && <label className="flex align-center gap-2 lg-meta">Cỡ <input type="range" min={0.03} max={0.6} step={0.01} value={prop.scale} disabled={disabled} onChange={(e) => setProp(n, { scale: Number(e.target.value) })} /></label>}
              <label className="flex align-center gap-2 lg-meta">
                <input type="checkbox" checked={prop.depth != null} disabled={disabled} onChange={(e) => setProp(n, { depth: e.target.checked ? GROUND_LINE : null })} /> Đặt trên bàn / kệ
                {prop.depth != null && <input type="range" min={0.5} max={1} step={0.01} value={prop.depth} disabled={disabled} title="Xa gần của cái bàn" aria-label="Xa gần của cái bàn" onChange={(e) => setProp(n, { depth: Number(e.target.value) })} />}
              </label>
              <select className="form-input" style={{ width: 'auto' }} value={prop.layer} disabled={disabled} onChange={(e) => setProp(n, { layer: e.target.value as StageProp['layer'] })} aria-label="Lớp">
                <option value="back">Sau nhân vật</option>
                <option value="front">Trước nhân vật</option>
              </select>
              <button className="icon-btn" title="Bỏ đạo cụ" disabled={disabled} onClick={() => onChange({ ...shot, props: shot.props.filter((_, i) => i !== n) })}><Trash2 size={14} /></button>
            </div>
          ))}
          {catalog.props.length > 0 && <div><button className="btn btn-ghost btn-sm" disabled={disabled} onClick={addProp}><Plus size={14} /> Đặt đạo cụ lên sân khấu</button></div>}
        </div>
      )}

      <div className="st-fields" style={{ marginTop: 8 }}>
        <label>Tông màu
          <select className="form-input" value={shot.tone} disabled={disabled} onChange={(e) => onChange({ ...shot, tone: e.target.value })}><Options labels={TONE_LABEL} /></select>
        </label>
        <label>Nguồn sáng
          <select className="form-input" value={shot.light?.kind ?? ''} disabled={disabled} onChange={(e) => setLight(e.target.value)}>
            <option value="">Không</option>
            <Options labels={LIGHT_LABEL} />
          </select>
        </label>
        {shot.light && (
          <>
            <label>Ngang <input type="range" min={0} max={1} step={0.01} value={shot.light.x} disabled={disabled} onChange={(e) => onChange({ ...shot, light: { ...shot.light!, x: Number(e.target.value) } })} /></label>
            <label>Dọc <input type="range" min={0} max={1} step={0.01} value={shot.light.y} disabled={disabled} onChange={(e) => onChange({ ...shot, light: { ...shot.light!, y: Number(e.target.value) } })} /></label>
          </>
        )}
      </div>
      <div className="flex align-center gap-3 lg-meta" style={{ flexWrap: 'wrap', marginTop: 6 }}>
        Không khí:
        {Object.entries(EFFECT_LABEL).map(([id, label]) => {
          const on = shot.effects.includes(id);
          return (
            <label key={id} className="flex align-center gap-1">
              <input type="checkbox" checked={on} disabled={disabled || (!on && shot.effects.length >= MAX_EFFECTS)} onChange={(e) => toggleEffect(id, e.target.checked)} /> {label}
            </label>
          );
        })}
      </div>

      <div className="form-group" style={{ margin: '8px 0 0' }}>
        <textarea className="form-input" rows={2} maxLength={MAX_CHARS} value={shot.text} disabled={disabled || !shot.speaker}
          placeholder={shot.speaker === NARRATOR ? 'Lời người kể' : shot.speaker ? 'Lời thoại' : 'Chọn người nói để viết lời'} onChange={(e) => onChange({ ...shot, text: e.target.value })} />
      </div>

      <div className="flex align-center gap-3" style={{ marginTop: 8 }}>
        <button className="btn btn-secondary btn-sm" disabled={previewing} onClick={onPreview}>{previewing ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} Xem thử</button>
      </div>
      {preview && <img className="st-preview" src={preview} alt={`Xem thử shot ${index + 1}`} />}
    </div>
  );
};
