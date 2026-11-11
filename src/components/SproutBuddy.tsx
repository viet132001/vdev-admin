import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

// Pixel art of the sprout robot on a 24 x 31 grid ('.' = transparent).
// Parts that animate (leaves, eyes, mouth, legs, sweat) are separate layers toggled with data-* attributes.
const LEAVES = [
  '.............DDDD.......',
  '............DLLllDD.....',
  '...DDD.....DLlllllDD....',
  '..DLLlDD..DlllllldD.....',
  '.DLllllD..DllllddD......',
  '.DlllllldDtDdddDD.......',
  '..DdddddDDt.DD..........',
  '....DDDD..tt............',
  '...........t............',
];
// Second leaf frame: the tips lean one pixel right, so swaying stays pixel-crisp instead of rotating.
const LEAVES_SWAY = LEAVES.map((row, y) => (y < 5 ? '.' + row.slice(0, -1) : row));

const HEAD = [
  '....oooooooooooooooo....',
  '..oohhhhhhhhhhhhhhhhoo..',
  '.ohh' + 'b'.repeat(17) + 'so.',
  '.ohb' + 'boooooooooooooob' + 'bso.',
  '.ohb' + 'o' + 'FFFFFFFFFFFFFF' + 'o' + 'bso.',
  '.ohb' + 'o' + 'Ffffffffffffff' + 'o' + 'bso.',
  '.ohb' + 'o' + 'Ffffffffffffff' + 'o' + 'bso.',
  '.ohb' + 'o' + 'Ffffffffffffff' + 'o' + 'bso.',
  '.ohb' + 'o' + 'Ffffffffffffff' + 'o' + 'bso.',
  '.ohb' + 'o' + 'FCcffffffffCcf' + 'o' + 'bso.',
  '.ohb' + 'o' + 'Ffffffffffffff' + 'o' + 'bso.',
  '.ohb' + 'boooooooooooooob' + 'bso.',
  '.oh' + 'b'.repeat(18) + 'so.',
  '..o' + 's'.repeat(18) + 'o..',
  '....oooooooooooooooo....',
  '.......o' + 'ssssssss' + 'o.......',
  '....oooo' + 'hbbGgbbs' + 'oooo....',
  '...ohbbo' + 'hbbggbbs' + 'obbso...',
  '...ooooo' + 'hbbbbbbs' + 'ooooo...',
  '.......o' + 'ssssssss' + 'o.......',
];
const LEGS_A = ['.......obbo..obbo.......', '.......oooo..oooo.......'];
const LEGS_B = ['......obbo....obbo......', '......oooo....oooo......'];

// Overlays as [x, y, color key]; face screen spans columns 5-18, rows 13-19.
type Px = [number, number, string];
const EYES_OPEN: Px[] = [
  [8, 15, 'e'], [9, 15, 'e'], [14, 15, 'e'], [15, 15, 'e'],
  [8, 16, 'e'], [9, 16, 'e'], [14, 16, 'e'], [15, 16, 'e'],
  [8, 17, 'e'], [9, 17, 'e'], [14, 17, 'e'], [15, 17, 'e'],
];
const EYES_BLINK: Px[] = [[8, 17, 'e'], [9, 17, 'e'], [14, 17, 'e'], [15, 17, 'e']];
const EYES_SCARED: Px[] = [
  [8, 15, 'e'], [9, 16, 'e'], [8, 17, 'e'],
  [15, 15, 'e'], [14, 16, 'e'], [15, 17, 'e'],
];
// Half-closed, out of breath
const EYES_TIRED: Px[] = [
  [7, 16, 'e'], [8, 16, 'e'], [9, 16, 'e'], [14, 16, 'e'], [15, 16, 'e'], [16, 16, 'e'],
  [8, 17, 'e'], [9, 17, 'e'], [14, 17, 'e'], [15, 17, 'e'],
];
// Short eyes under brows slanting toward the middle
const EYES_ANGRY: Px[] = [
  [7, 14, 'e'], [8, 14, 'e'], [9, 15, 'e'], [16, 14, 'e'], [15, 14, 'e'], [14, 15, 'e'],
  [8, 16, 'e'], [9, 16, 'e'], [14, 16, 'e'], [15, 16, 'e'],
  [8, 17, 'e'], [9, 17, 'e'], [14, 17, 'e'], [15, 17, 'e'],
];
// Closed "u u" eyes
const EYES_SLEEP: Px[] = [
  [7, 16, 'e'], [8, 17, 'e'], [9, 17, 'e'], [10, 16, 'e'],
  [13, 16, 'e'], [14, 17, 'e'], [15, 17, 'e'], [16, 16, 'e'],
];
const MOUTH_SMILE: Px[] = [[11, 18, 'm'], [12, 18, 'm']];
const MOUTH_OPEN: Px[] = [[11, 18, 'm'], [12, 18, 'm'], [11, 19, 'M'], [12, 19, 'M']];
const MOUTH_SLEEP: Px[] = [[11, 19, 'm']];
const SWEAT: Px[] = [[22, 7, 'q'], [21, 8, 'q'], [22, 8, 'Q'], [21, 9, 'Q'], [22, 9, 'Q']];
// Cartoon anger vein on the top-left of the head
const ANGER: Px[] = [
  [1, 7, 'r'], [3, 7, 'r'], [0, 8, 'r'], [1, 8, 'r'], [3, 8, 'r'], [4, 8, 'r'],
  [0, 10, 'r'], [1, 10, 'r'], [3, 10, 'r'], [4, 10, 'r'], [1, 11, 'r'], [3, 11, 'r'],
];

const COLORS: Record<string, string> = {
  o: '#3d2a1c', // outline
  h: '#fbf7e4', // body highlight
  b: '#ece4c2', // body
  s: '#d2c698', // body shade
  F: '#efe5c4', // face screen inner shadow
  f: '#fdf9ea', // face screen
  e: '#1d2230', // eyes
  c: '#f2a29e', // cheeks
  C: '#f9c9c3', // cheek highlight
  m: '#8a4a3a', // mouth
  M: '#d9766d', // open mouth inside
  G: '#c8f0a6', // gem highlight
  g: '#6fbf5c', // gem
  L: '#d6ef93', // leaf highlight
  l: '#a7d063', // leaf
  d: '#73a23a', // leaf dark
  D: '#44662a', // leaf outline
  t: '#6c7d34', // stem
  q: '#cfeeff', // sweat highlight
  Q: '#6db8ea', // sweat
  r: '#e0453a', // anger vein
};

const PX = 3; // screen pixels per sprite pixel
const W = 24;
const BODY_H = LEAVES.length + HEAD.length;
const H = BODY_H + LEGS_A.length + 2; // room for the ground shadow
const FLEE_RADIUS = 130;
const WALK_SPEED = 45;
const FLEE_SPEED = 320;
const MARCH_SPEED = 190;
const TIRED_AFTER = 4.5; // seconds of being chased before it gives up running
const TIRED_FOR = 4500; // ms it stands there catching its breath
const FED_UP_AFTER = 2; // seconds of pestering while tired before it storms off to turn the lights off
const GRUMPY_FOR = 20000; // ms after resting during which getting tired again sends it straight to bed

const TIRED_LINES = ['Dí hoài vậy trời!', 'Hết hơi rồi nè...', 'Mệt quá rồi nha!', 'Rảnh quá ha?', 'Cho thở xíu coi!'];
const ANGRY_LINES = ['Nói rồi mà! #@$%!', 'Bực mình ghê á!', 'Con chuột phiền phức!', 'Ê! Thôi đi!!'];
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

const fromRows = (rows: string[], y0: number, prefix: string) =>
  rows.flatMap((row, y) =>
    [...row].map((ch, x) =>
      COLORS[ch] ? <rect key={`${prefix}${x}-${y}`} x={x} y={y + y0} width={1} height={1} fill={COLORS[ch]} /> : null,
    ),
  );
const fromPx = (pxs: Px[]) =>
  pxs.map(([x, y, ch]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[ch]} />);

const LAYERS = {
  leaves: fromRows(LEAVES, 0, 'l'),
  leavesSway: fromRows(LEAVES_SWAY, 0, 's'),
  head: fromRows(HEAD, LEAVES.length, 'h'),
  legsA: fromRows(LEGS_A, BODY_H, 'a'),
  legsB: fromRows(LEGS_B, BODY_H, 'b'),
};
const FACES = {
  open: fromPx(EYES_OPEN),
  blink: fromPx(EYES_BLINK),
  scared: fromPx(EYES_SCARED),
  tired: fromPx(EYES_TIRED),
  angry: fromPx(EYES_ANGRY),
  sleep: fromPx(EYES_SLEEP),
};
const MOUTHS = { smile: fromPx(MOUTH_SMILE), open: fromPx(MOUTH_OPEN), sleep: fromPx(MOUTH_SLEEP) };

type Mode = 'wander' | 'tired' | 'march' | 'sleep' | 'wake';

// The visible button that turns the dark theme on: "Tối" in the sidebar, or the header toggle on mobile.
const findDarkButton = (): HTMLElement | null => {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>('.theme-switch button[title="Tối"]'),
    ...document.querySelectorAll<HTMLElement>('.theme-toggle-btn'),
  ];
  return candidates.find((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
  }) || null;
};

// A small pixel robot that wanders around the viewport and runs from the mouse.
// Chased too long it gets tired and grumbles; pester it more and it marches to the theme switch,
// turns the lights off and goes to sleep. It sleeps whenever the dark theme is on.
// pointer-events: none, so it never blocks clicks; everything is written straight to the DOM each frame to avoid re-renders.
export const SproutBuddy: React.FC = () => {
  const { setTheme } = useTheme();
  const setThemeRef = useRef(setTheme);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThemeRef.current = setTheme;
  }, [setTheme]);

  useEffect(() => {
    const el = wrapRef.current;
    const body = bodyRef.current;
    const look = lookRef.current;
    const bubble = bubbleRef.current;
    if (!el || !body || !look || !bubble) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDark = () => document.documentElement.dataset.theme === 'dark';
    const w = W * PX;
    const h = H * PX;

    const state = {
      mode: (isDark() ? 'sleep' : 'wander') as Mode,
      modeAt: performance.now(),
      x: window.innerWidth - w - 40,
      y: window.innerHeight - h - 40,
      tx: 0,
      ty: 0,
      pauseUntil: 0,
      lookX: 0,
      mouseX: -9999,
      mouseY: -9999,
      fleeing: false,
      startledAt: 0,
      step: 0,
      chase: 0, // seconds of recent chasing, decays while left alone
      pester: 0, // seconds the cursor has hovered over it while it rests
      angrySaid: false,
      grumpyUntil: 0,
      pressedAt: 0,
      nextBlink: performance.now() + 2500,
      blinkUntil: 0,
      bubbleUntil: 0,
      sleepNagAt: 0,
    };

    const say = (text: string, ms = 2600) => {
      bubble.textContent = text;
      state.bubbleUntil = performance.now() + ms;
    };
    const setMode = (mode: Mode) => {
      state.mode = mode;
      state.modeAt = performance.now();
      state.fleeing = false;
      state.pester = 0;
      state.angrySaid = false;
    };
    const pickTarget = () => {
      state.tx = 16 + Math.random() * Math.max(0, window.innerWidth - w - 32);
      state.ty = 16 + Math.random() * Math.max(0, window.innerHeight - h - 32);
    };
    pickTarget();

    const onMove = (e: PointerEvent) => {
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;
    };
    const onLeave = () => {
      state.mouseX = -9999;
      state.mouseY = -9999;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);

    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const maxX = window.innerWidth - w - 4;
      const maxY = window.innerHeight - h - 4;
      const mdx = state.x + w / 2 - state.mouseX;
      const mdy = state.y + h / 2 - state.mouseY;
      const mdist = Math.hypot(mdx, mdy);
      const near = mdist < FLEE_RADIUS;
      const dark = isDark();

      // The theme decides bedtime, whoever flipped it
      if (dark && state.mode !== 'sleep' && state.mode !== 'march') setMode('sleep');
      if (!dark && state.mode === 'sleep') {
        setMode('wake');
        say('Ơ... ai bật đèn vậy!?', 2200);
        state.chase = 0;
      }

      let vx = 0;
      let vy = 0;
      let speedMul = 1;

      if (state.mode === 'wander') {
        if (near) {
          // Run straight away from the cursor; when pinned against a wall, slide along it instead.
          let nx = mdx / (mdist || 1);
          let ny = mdy / (mdist || 1);
          if ((state.x <= 4 && nx < 0) || (state.x >= maxX && nx > 0)) {
            nx = 0;
            ny = ny >= 0 ? 1 : -1;
          }
          if ((state.y <= 4 && ny < 0) || (state.y >= maxY && ny > 0)) {
            ny = 0;
            nx = nx >= 0 ? 1 : -1;
            if (state.x <= 4 || state.x >= maxX) nx = state.x <= 4 ? 1 : -1;
          }
          const speed = FLEE_SPEED * (1 - mdist / FLEE_RADIUS) + 140;
          vx = nx * speed;
          vy = ny * speed;
          if (!state.fleeing) state.startledAt = now;
          state.fleeing = true;
          state.pauseUntil = 0;
          state.chase += dt;
          if (state.chase > TIRED_AFTER) {
            if (now < state.grumpyUntil) {
              setMode('march');
              say('Hết chịu nổi! Tắt đèn đi ngủ!', 3000);
            } else {
              setMode('tired');
              say(pick(TIRED_LINES));
            }
          }
        } else {
          state.chase = Math.max(0, state.chase - dt * 0.25);
          if (state.fleeing) {
            state.fleeing = false;
            state.pauseUntil = now + 900;
            pickTarget();
          }
          if (!reduced && now > state.pauseUntil) {
            const dx = state.tx - state.x;
            const dy = state.ty - state.y;
            const d = Math.hypot(dx, dy);
            if (d < 4) {
              state.pauseUntil = now + 1200 + Math.random() * 3500;
              pickTarget();
            } else {
              vx = (dx / d) * WALK_SPEED;
              vy = (dy / d) * WALK_SPEED;
            }
          }
        }
      } else if (state.mode === 'tired') {
        // Too winded to run: it just stands there and tells you off
        if (near) {
          state.pester += dt;
          if (state.pester > 0.6 && !state.angrySaid) {
            state.angrySaid = true;
            say(pick(ANGRY_LINES));
          }
          if (state.pester > FED_UP_AFTER) {
            setMode('march');
            say('Hết chịu nổi! Tắt đèn đi ngủ!', 3000);
          }
        } else if (now - state.modeAt > TIRED_FOR) {
          setMode('wander');
          state.chase = TIRED_AFTER * 0.55;
          state.grumpyUntil = now + GRUMPY_FOR;
          state.pauseUntil = now + 800;
          pickTarget();
        }
      } else if (state.mode === 'march') {
        // Ignores the cursor and heads for the dark-theme button, then stands on it
        const btn = findDarkButton();
        if (!btn) {
          if (now - state.modeAt > 1200) {
            setThemeRef.current('dark');
            say('Ngủ đây. Đừng phá nha!', 2400);
            setMode('sleep');
          }
        } else if (state.pressedAt) {
          if (now - state.pressedAt > 350) {
            setThemeRef.current('dark');
            state.pressedAt = 0;
            say('Tách! Ngủ ngon...', 2400);
            setMode('sleep');
          }
        } else {
          const r = btn.getBoundingClientRect();
          const gx = Math.min(maxX, Math.max(4, r.left + r.width / 2 - w / 2));
          const gy = Math.min(maxY, Math.max(4, r.top - h + 10));
          const dx = gx - state.x;
          const dy = gy - state.y;
          const d = Math.hypot(dx, dy);
          if (d < 6) {
            state.pressedAt = now;
            state.startledAt = now;
          } else {
            const step = Math.min(d, MARCH_SPEED * dt);
            vx = (dx / d) * MARCH_SPEED;
            vy = (dy / d) * MARCH_SPEED;
            speedMul = step / (MARCH_SPEED * dt || 1);
          }
        }
      } else if (state.mode === 'sleep') {
        if (near) {
          state.pester += dt;
          if (state.pester > 1.2 && now - state.sleepNagAt > 6000) {
            state.sleepNagAt = now;
            say('Ưm... để yên cho ngủ...', 2200);
          }
        } else {
          state.pester = 0;
        }
      } else if (state.mode === 'wake' && now - state.modeAt > 1800) {
        setMode('wander');
        state.pauseUntil = now + 600;
        pickTarget();
      }

      state.x = Math.min(maxX, Math.max(4, state.x + vx * dt * speedMul));
      state.y = Math.min(maxY, Math.max(4, state.y + vy * dt * speedMul));
      // Eyes glance toward where it is heading instead of flipping the shaded sprite
      if (Math.abs(vx) > 1) state.lookX = vx > 0 ? 1 : -1;
      else if (Math.abs(vy) <= 1) state.lookX = 0;

      const moving = Math.abs(vx) + Math.abs(vy) > 1;
      const fast = state.fleeing || state.mode === 'march';
      if (moving) state.step += dt * (fast ? 13 : 6);
      const legFrame = moving ? Math.floor(state.step) % 2 : 0;
      const hop = (state.fleeing || state.pressedAt) && now - state.startledAt < 160 ? -3 : 0;
      let bob = hop || (moving && legFrame ? -1 : 0);
      if (state.mode === 'tired') bob = Math.floor(now / 260) % 2; // panting
      if (state.mode === 'sleep') bob = 2 + (Math.floor(now / 1400) % 2); // sitting, slow breathing

      if (now > state.nextBlink) {
        state.blinkUntil = now + 140;
        state.nextBlink = now + 2200 + Math.random() * 3800;
      }
      let face = now < state.blinkUntil ? 'blink' : 'open';
      let mouth = 'smile';
      if (state.fleeing) [face, mouth] = ['scared', 'open'];
      else if (state.mode === 'tired') [face, mouth] = [state.pester > 0.6 ? 'angry' : 'tired', 'open'];
      else if (state.mode === 'march') [face, mouth] = ['angry', 'smile'];
      else if (state.mode === 'sleep') [face, mouth] = ['sleep', 'sleep'];
      else if (state.mode === 'wake') [face, mouth] = [now - state.modeAt < 500 ? 'blink' : 'open', 'open'];

      const leafRate = state.mode === 'sleep' ? 0 : fast ? 90 : moving ? 260 : 700;
      const leaf = leafRate ? Math.floor(now / leafRate) % 2 : 0;

      el.style.transform = `translate3d(${Math.round(state.x)}px, ${Math.round(state.y)}px, 0)`;
      body.setAttribute('transform', `translate(0 ${bob})`);
      look.setAttribute('transform', `translate(${state.mode === 'sleep' ? 0 : state.lookX} 0)`);
      el.dataset.mode = state.mode;
      el.dataset.leg = String(legFrame);
      el.dataset.leaf = String(leaf);
      el.dataset.face = face;
      el.dataset.mouth = mouth;
      el.dataset.sweat = state.fleeing || state.mode === 'tired' ? '1' : '0';
      el.dataset.anger = (state.mode === 'tired' && state.pester > 0.6) || state.mode === 'march' ? '1' : '0';
      el.dataset.bubble = now < state.bubbleUntil ? '1' : '0';
      // Keep the speech bubble on screen near the edges
      el.dataset.bubbleX = state.x < 70 ? 'left' : state.x > window.innerWidth - w - 70 ? 'right' : 'center';
      el.dataset.bubbleY = state.y < 50 ? 'below' : 'above';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="sprout-buddy"
      aria-hidden="true"
      data-mode="wander"
      data-leg="0"
      data-leaf="0"
      data-face="open"
      data-mouth="smile"
      data-sweat="0"
      data-anger="0"
      data-bubble="0"
    >
      <div ref={bubbleRef} className="sb-bubble" />
      <div className="sb-zzz"><i>z</i><i>z</i><i>Z</i></div>
      <svg width={W * PX} height={H * PX} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges">
        <ellipse className="sb-shadow" cx={W / 2} cy={BODY_H + 2} rx={7} ry={1.4} shapeRendering="geometricPrecision" />
        <g ref={bodyRef}>
          <g className="sb-leaf-0">{LAYERS.leaves}</g>
          <g className="sb-leaf-1">{LAYERS.leavesSway}</g>
          {LAYERS.head}
          <g ref={lookRef}>
            {Object.entries(FACES).map(([name, rects]) => <g key={name} className={`sb-face sb-face-${name}`}>{rects}</g>)}
            {Object.entries(MOUTHS).map(([name, rects]) => <g key={name} className={`sb-mouth sb-mouth-${name}`}>{rects}</g>)}
          </g>
          <g className="sb-sweat">{fromPx(SWEAT)}</g>
          <g className="sb-anger">{fromPx(ANGER)}</g>
          <g className="sb-legs">
            <g className="sb-leg-0">{LAYERS.legsA}</g>
            <g className="sb-leg-1">{LAYERS.legsB}</g>
          </g>
        </g>
      </svg>
    </div>
  );
};
