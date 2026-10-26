import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Frame for a running game. On phones it covers the whole screen and follows the visual viewport,
// so the play field and the input stay visible above the on-screen keyboard.
export const GameStage: React.FC<{ title: string; onExit: () => void; children: React.ReactNode }> = ({ title, onExit, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      ref.current?.style.setProperty('--vvh', `${vv.height}px`);
      ref.current?.style.setProperty('--vvt', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <div ref={ref} className="gm-stage">
      <div className="gm-stage-bar">
        <b>{title}</b>
        <button className="icon-btn" title="Thoát trò chơi" onClick={onExit}><X size={18} /></button>
      </div>
      <div className="gm-stage-body">{children}</div>
    </div>
  );
};

export const GameHud: React.FC<{ score: number; combo: number; progress: string; children?: React.ReactNode }> = ({ score, combo, progress, children }) => (
  <div className="gm-hud">
    {children}
    <span><b>{score}</b> điểm</span>
    {combo > 1 && <span className="gm-combo">x{combo}</span>}
    <span className="gm-progress">{progress}</span>
  </div>
);

export const TimerBar: React.FC<{ ratio: number }> = ({ ratio }) => (
  <div className={`gm-timer ${ratio < 0.3 ? 'low' : ''}`}>
    <div style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
  </div>
);
