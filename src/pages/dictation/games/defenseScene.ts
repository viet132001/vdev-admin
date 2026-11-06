// Canvas renderer for the castle defense game. It only draws: rules and scoring stay in DefenseGame.tsx.
// All art is procedural so the game needs no image assets.

export interface SceneEnemy {
  uid: number;
  x: number; // center, fraction of field width
  y: number; // 0 = top of the lane, 1 = reached the wall
  meaning: string;
  mask: string | null;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  gravity: number; glow: boolean;
}

interface Shot {
  x0: number; y0: number; x1: number; y1: number;
  t: number; duration: number; tier: number;
  ghost: { enemy: SceneEnemy; x: number; y: number } | null;
  term: string; points: number;
}

interface FloatText { x: number; y: number; text: string; sub?: string; color: string; t: number; duration: number; panel: boolean }
interface Ring { x: number; y: number; t: number; duration: number; radius: number; color: string }
interface Label { lines: string[]; width: number; height: number }

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';
const MAX_PARTICLES = 500;
const IMP_COLORS = [
  { body: '#5b2a86', belly: '#8d55b8', wing: '#3a1a5e' },
  { body: '#2f6b4f', belly: '#5da07e', wing: '#1c4634' },
  { body: '#8f2d3f', belly: '#c45a6a', wing: '#5e1a28' },
  { body: '#2d4f8f', belly: '#5b80c4', wing: '#1a315e' }
];
const SHOT_COLORS = [
  { core: '#fff1c4', glow: '#ff9a3c' }, // default
  { core: '#e2fbff', glow: '#3cc8ff' }, // combo 5+
  { core: '#f6e4ff', glow: '#b76bff' } // combo 10+
];
const FIRE_SPOTS = [0.18, 0.82, 0.33, 0.67, 0.5];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const random = (min: number, max: number) => min + Math.random() * (max - min);

// Same art after every resize, so the background doesn't reshuffle
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export const createDefenseScene = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d')!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const background = document.createElement('canvas');
  const castle = document.createElement('canvas');

  let W = 0, H = 0, dpr = 1;
  let castleH = 0, wallTop = 0, keepTop = 0, keepW = 0, laneTop = 0, laneBottom = 0, impScale = 1;
  let time = 0, shake = 0, flash = 0, recoil = 0, aim = -Math.PI / 2, targetAim = -Math.PI / 2;
  let state: 'playing' | 'won' | 'lost' = 'playing';
  let endedFor = 0, fireworkIn = 0, sink = 0;
  let banner: { text: string; color: string; t: number; duration: number } | null = null;
  let stars: { x: number; y: number; size: number; phase: number }[] = [];
  let clouds: { x: number; y: number; scale: number; speed: number }[] = [];

  let particles: Particle[] = [];
  let shots: Shot[] = [];
  let texts: FloatText[] = [];
  let rings: Ring[] = [];
  const labels = new Map<string, Label>();

  // ---------- static art ----------

  const paintBackground = () => {
    background.width = W * dpr;
    background.height = H * dpr;
    const c = background.getContext('2d')!;
    c.scale(dpr, dpr);
    const horizon = wallTop + 12;

    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#120e2f');
    sky.addColorStop(0.45, '#33255f');
    sky.addColorStop(0.75, '#8f4670');
    sky.addColorStop(1, '#f09a5c');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    const sun = c.createRadialGradient(W * 0.28, horizon, 4, W * 0.28, horizon, W * 0.42);
    sun.addColorStop(0, 'rgba(255, 214, 140, 0.75)');
    sun.addColorStop(1, 'rgba(255, 214, 140, 0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, W, H);

    // Moon
    const moonX = W * 0.84, moonY = Math.max(44, H * 0.13), moonR = clamp(W * 0.035, 12, 24);
    const halo = c.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR * 3.2);
    halo.addColorStop(0, 'rgba(240, 235, 255, 0.28)');
    halo.addColorStop(1, 'rgba(240, 235, 255, 0)');
    c.fillStyle = halo;
    c.fillRect(moonX - moonR * 4, moonY - moonR * 4, moonR * 8, moonR * 8);
    c.fillStyle = '#efeaf8';
    c.beginPath();
    c.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(160, 150, 190, 0.45)';
    [[-0.3, -0.2, 0.22], [0.3, 0.1, 0.16], [-0.1, 0.42, 0.13]].forEach(([dx, dy, r]) => {
      c.beginPath();
      c.arc(moonX + dx * moonR, moonY + dy * moonR, r * moonR, 0, Math.PI * 2);
      c.fill();
    });

    // Mountain ranges, far to near
    const ranges = [
      { color: '#5a3a70', base: horizon - castleH * 0.5, height: castleH * 0.75, step: 46, seed: 3 },
      { color: '#3d2a58', base: horizon - castleH * 0.2, height: castleH * 0.6, step: 34, seed: 9 },
      { color: '#231a3d', base: horizon + 2, height: castleH * 0.42, step: 24, seed: 17 }
    ];
    ranges.forEach((range) => {
      const rng = seeded(range.seed);
      c.fillStyle = range.color;
      c.beginPath();
      c.moveTo(0, H);
      c.lineTo(0, range.base);
      for (let x = 0; x <= W + range.step; x += range.step) {
        c.lineTo(x, range.base - rng() * range.height);
        c.lineTo(x + range.step / 2, range.base - rng() * range.height * 0.35);
      }
      c.lineTo(W, H);
      c.closePath();
      c.fill();
    });

    // Pine line right behind the wall
    const rng = seeded(31);
    c.fillStyle = '#16112a';
    for (let x = -6; x < W + 10; x += 9 + rng() * 12) {
      const h = 12 + rng() * 22;
      c.beginPath();
      c.moveTo(x - 7, horizon + 4);
      c.lineTo(x, horizon + 4 - h);
      c.lineTo(x + 7, horizon + 4);
      c.closePath();
      c.fill();
    }
  };

  const paintStone = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rng: () => number, base = 34) => {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = `hsl(250, 12%, ${base - 14}%)`;
    c.fillRect(x, y, w, h);
    const rowH = 10, brickW = 20;
    for (let row = 0, by = y; by < y + h; row++, by += rowH) {
      for (let bx = x - (row % 2 ? brickW / 2 : 0); bx < x + w; bx += brickW) {
        const light = base + (rng() - 0.5) * 9;
        c.fillStyle = `hsl(${245 + rng() * 15}, 12%, ${light}%)`;
        c.fillRect(bx + 0.5, by + 0.5, brickW - 1, rowH - 1);
        c.fillStyle = 'rgba(255, 255, 255, 0.07)';
        c.fillRect(bx + 0.5, by + 0.5, brickW - 1, 1);
      }
    }
    c.restore();
  };

  const paintMerlons = (c: CanvasRenderingContext2D, x: number, y: number, w: number, rng: () => number, base = 34) => {
    const size = 11;
    const gap = 9;
    const count = Math.max(1, Math.floor((w + gap) / (size + gap)));
    const offset = (w - (count * size + (count - 1) * gap)) / 2;
    for (let i = 0; i < count; i++) paintStone(c, x + offset + i * (size + gap), y - 9, size, 10, rng, base + 4);
  };

  const paintCastle = () => {
    castle.width = W * dpr;
    castle.height = H * dpr;
    const c = castle.getContext('2d')!;
    c.scale(dpr, dpr);
    const rng = seeded(7);
    const cx = W / 2;
    const towerW = clamp(keepW * 0.24, 22, 48);

    paintStone(c, 0, wallTop, W, H - wallTop, rng);
    paintMerlons(c, 0, wallTop, W, rng);

    // Sides of the wall fall into shadow, which pulls the eye to the keep
    const shade = c.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, 'rgba(10, 6, 30, 0.55)');
    shade.addColorStop(0.3, 'rgba(10, 6, 30, 0)');
    shade.addColorStop(0.7, 'rgba(10, 6, 30, 0)');
    shade.addColorStop(1, 'rgba(10, 6, 30, 0.55)');
    c.fillStyle = shade;
    c.fillRect(0, wallTop - 10, W, H);

    // Keep with two flanking towers
    paintStone(c, cx - keepW / 2, keepTop, keepW, H - keepTop, rng, 38);
    paintMerlons(c, cx - keepW / 2 + towerW, keepTop, keepW - towerW * 2, rng, 38);
    [cx - keepW / 2 - towerW * 0.4, cx + keepW / 2 - towerW * 0.6].forEach((x) => {
      const top = keepTop - castleH * 0.14;
      paintStone(c, x, top, towerW, H - top, rng, 42);
      paintMerlons(c, x, top, towerW, rng, 42);
      c.fillStyle = 'rgba(10, 6, 30, 0.22)';
      c.fillRect(x + towerW * 0.62, top, towerW * 0.38, H - top);
      // Lit arrow slit
      c.fillStyle = '#ffc766';
      c.fillRect(x + towerW / 2 - 2, top + 16, 4, 11);
    });

    // Gate
    const gateW = clamp(keepW * 0.3, 22, 56);
    const gateH = Math.min(castleH * 0.5, H - keepTop - 4);
    const gateY = H - gateH;
    c.fillStyle = '#0d0a1c';
    c.beginPath();
    c.moveTo(cx - gateW / 2, H);
    c.lineTo(cx - gateW / 2, gateY + gateW / 2);
    c.arc(cx, gateY + gateW / 2, gateW / 2, Math.PI, 0);
    c.lineTo(cx + gateW / 2, H);
    c.closePath();
    c.fill();
    c.strokeStyle = '#4a4258';
    c.lineWidth = 2;
    for (let x = cx - gateW / 2 + 6; x < cx + gateW / 2; x += 8) {
      c.beginPath();
      c.moveTo(x, gateY + 4);
      c.lineTo(x, H);
      c.stroke();
    }
    c.lineWidth = 3;
    c.strokeStyle = '#6a6078';
    c.beginPath();
    c.arc(cx, gateY + gateW / 2, gateW / 2, Math.PI, 0);
    c.stroke();

    // Windows
    c.fillStyle = '#ffcf7a';
    [-0.3, 0.3].forEach((f) => {
      const x = cx + keepW * f;
      if (H - keepTop < 34) return;
      c.fillRect(x - 3, keepTop + 11, 6, 11);
      c.beginPath();
      c.arc(x, keepTop + 11, 3, Math.PI, 0);
      c.fill();
    });
  };

  const resize = (width: number, height: number) => {
    W = Math.max(1, Math.round(width));
    H = Math.max(1, Math.round(height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    castleH = clamp(H * 0.26, 56, 140);
    wallTop = H - castleH * 0.55;
    keepTop = H - castleH;
    keepW = clamp(W * 0.3, 96, 230);
    // Imps fly in from above the field, so they travel the whole sky
    laneTop = -34;
    laneBottom = Math.max(laneTop + 10, wallTop - 46);
    impScale = clamp(Math.min(W / 620, H / 420), 0.72, 1.1);

    const rng = seeded(21);
    stars = Array.from({ length: Math.round(W / 11) }, () => ({ x: rng() * W, y: rng() * wallTop * 0.62, size: 0.5 + rng() * 1.3, phase: rng() * 6.28 }));
    clouds = Array.from({ length: 4 }, () => ({ x: rng() * W, y: 26 + rng() * wallTop * 0.42, scale: 0.6 + rng() * 0.9, speed: 3 + rng() * 6 }));

    labels.clear();
    paintBackground();
    paintCastle();
  };

  // ---------- effects ----------

  const burst = (x: number, y: number, count: number, colors: string[], speed: number, size: number, gravity = 140) => {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = random(speed * 0.25, speed);
      const max = random(0.35, 0.85);
      particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: max, max,
        size: random(size * 0.4, size), color: colors[Math.floor(Math.random() * colors.length)], gravity, glow: true
      });
    }
  };

  const smoke = (x: number, y: number, size: number) => {
    if (particles.length >= MAX_PARTICLES) return;
    const max = random(0.9, 1.6);
    particles.push({ x, y, vx: random(-9, 9), vy: random(-34, -18), life: max, max, size, color: '#2a2433', gravity: -5, glow: false });
  };

  const flame = (x: number, y: number) => {
    if (particles.length >= MAX_PARTICLES) return;
    const max = random(0.25, 0.55);
    particles.push({
      x: x + random(-9, 9), y, vx: random(-7, 7), vy: random(-85, -40), life: max, max,
      size: random(4, 10), color: ['#ffb13c', '#ff7a2a', '#ffd76a'][Math.floor(Math.random() * 3)], gravity: -20, glow: true
    });
  };

  const addShake = (amount: number) => {
    if (!reducedMotion) shake = Math.min(14, shake + amount);
  };

  // ---------- enemies ----------

  const labelFor = (enemy: SceneEnemy) => {
    const key = `${enemy.meaning}\n${enemy.mask ?? ''}`;
    const cached = labels.get(key);
    if (cached) return cached;
    const maxWidth = Math.min(W * 0.42, 210);
    ctx.font = `600 14px ${FONT}`;
    const lines: string[] = [];
    let line = '';
    enemy.meaning.split(/\s+/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    let width = Math.max(...lines.map((l) => ctx.measureText(l).width), 20);
    if (enemy.mask) {
      ctx.font = `500 12px ${MONO}`;
      width = Math.max(width, ctx.measureText(enemy.mask).width);
    }
    const label = { lines, width: Math.min(width, W - 28) + 20, height: lines.length * 18 + (enemy.mask ? 16 : 0) + 10 };
    labels.set(key, label);
    return label;
  };

  const enemyPosition = (enemy: SceneEnemy) => {
    const half = enemy.meaning ? labelFor(enemy).width / 2 : 30;
    return { x: clamp(enemy.x * W, half + 6, Math.max(half + 6, W - half - 6)), y: lerp(laneTop, laneBottom, Math.min(enemy.y, 1)) };
  };

  const drawImp = (x: number, y: number, uid: number, danger: boolean) => {
    const color = IMP_COLORS[uid % IMP_COLORS.length];
    const flap = Math.sin(time * (danger ? 22 : 13) + uid);
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 3 + uid) * 2);
    ctx.scale(impScale, impScale);

    // Wings
    ctx.fillStyle = color.wing;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(flap * 0.35 - 0.1);
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.quadraticCurveTo(20, -24, 38, -15);
      ctx.quadraticCurveTo(31, -8, 34, -1);
      ctx.quadraticCurveTo(25, -5, 24, 4);
      ctx.quadraticCurveTo(17, 0, 8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Tail
    ctx.strokeStyle = color.body;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-7, 8);
    ctx.quadraticCurveTo(-19, 11 + flap * 2, -17, 1);
    ctx.stroke();

    // Horns
    ctx.fillStyle = '#e8ddc4';
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * 5, -11);
      ctx.quadraticCurveTo(side * 12, -17, side * 11, -22);
      ctx.quadraticCurveTo(side * 7, -18, side * 2, -13);
      ctx.closePath();
      ctx.fill();
    });

    // Body
    ctx.fillStyle = color.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13.5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color.belly;
    ctx.beginPath();
    ctx.ellipse(0, 6, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes and teeth
    const eye = danger ? '#ff5340' : '#ffe35a';
    [-5, 5].forEach((ex) => {
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.ellipse(ex, -3, 3.8, 3, ex < 0 ? 0.35 : -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17101f';
      ctx.beginPath();
      ctx.arc(ex, -2.4, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#17101f';
    roundRect(ctx, -5, 2.5, 10, 4, 2);
    ctx.fill();
    ctx.fillStyle = '#fff6df';
    [-3, 1].forEach((tx) => {
      ctx.beginPath();
      ctx.moveTo(tx, 2.5);
      ctx.lineTo(tx + 2, 2.5);
      ctx.lineTo(tx + 1, 5.2);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  };

  const drawSign = (enemy: SceneEnemy, x: number, y: number, danger: boolean) => {
    const label = labelFor(enemy);
    const left = x - label.width / 2;
    const top = y + 14 * impScale + 8;
    const swing = Math.sin(time * 2.4 + enemy.uid) * 0.018;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing);
    ctx.translate(-x, -y);

    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 9 * impScale);
    ctx.lineTo(left + 10, top + 2);
    ctx.moveTo(x + 7, y + 9 * impScale);
    ctx.lineTo(left + label.width - 10, top + 2);
    ctx.stroke();

    const pulse = danger ? 0.55 + Math.sin(time * 9) * 0.45 : 0;
    if (danger) {
      ctx.fillStyle = `rgba(255, 60, 40, ${0.3 * pulse + 0.1})`;
      roundRect(ctx, left - 4, top - 4, label.width + 8, label.height + 8, 8);
      ctx.fill();
    }
    const wood = ctx.createLinearGradient(0, top, 0, top + label.height);
    wood.addColorStop(0, '#7d5230');
    wood.addColorStop(1, '#553419');
    ctx.fillStyle = wood;
    roundRect(ctx, left, top, label.width, label.height, 5);
    ctx.fill();
    ctx.strokeStyle = danger ? '#ff6a4a' : '#2f1c0e';
    ctx.lineWidth = danger ? 2 : 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.fillRect(left + 3, top + label.height * 0.5, label.width - 6, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = '#fff5dc';
    label.lines.forEach((line, i) => ctx.fillText(line, x, top + 14 + i * 18, label.width - 8));
    if (enemy.mask) {
      ctx.font = `500 12px ${MONO}`;
      ctx.fillStyle = '#ffd98a';
      ctx.fillText(enemy.mask, x, top + label.height - 11, label.width - 8);
    }
    ctx.restore();
  };

  const drawEnemy = (enemy: SceneEnemy, at?: { x: number; y: number }) => {
    const pos = at ?? enemyPosition(enemy);
    const danger = enemy.y > 0.75;
    const jitter = danger && !reducedMotion ? Math.sin(time * 40 + enemy.uid) * 0.8 : 0;
    drawImp(pos.x + jitter, pos.y, enemy.uid, danger);
    if (enemy.meaning) drawSign(enemy, pos.x + jitter, pos.y, danger);
  };

  // ---------- frame ----------

  const drawClouds = () => {
    ctx.fillStyle = 'rgba(214, 190, 225, 0.12)';
    clouds.forEach((cloud) => {
      [[-26, 2, 13], [-10, -4, 18], [10, -2, 16], [27, 3, 11]].forEach(([dx, dy, r]) => {
        ctx.beginPath();
        ctx.arc(cloud.x + dx * cloud.scale, cloud.y + dy * cloud.scale, r * cloud.scale, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  };

  const drawFlag = (x: number, top: number, phase: number) => {
    ctx.strokeStyle = '#c4bcd2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top - 25);
    ctx.stroke();
    ctx.fillStyle = '#c8384a';
    ctx.beginPath();
    ctx.moveTo(x, top - 25);
    for (let i = 1; i <= 5; i++) ctx.lineTo(x + i * 4.2, top - 25 + Math.sin(time * 6 + phase + i * 0.9) * (i * 0.55));
    for (let i = 5; i >= 0; i--) ctx.lineTo(x + i * 4.2, top - 14 + Math.sin(time * 6 + phase + i * 0.9) * (i * 0.55));
    ctx.closePath();
    ctx.fill();
  };

  const drawTorch = (x: number, y: number, phase: number) => {
    const flicker = 1 + Math.sin(time * 13 + phase) * 0.14 + Math.sin(time * 29 + phase) * 0.08;
    const glow = ctx.createRadialGradient(x, y, 1, x, y, 26 * flicker);
    glow.addColorStop(0, 'rgba(255, 186, 90, 0.55)');
    glow.addColorStop(1, 'rgba(255, 186, 90, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.fillStyle = '#ffb13c';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 3, 5.5 * flicker, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2a1c';
    ctx.fillRect(x - 1.5, y + 3, 3, 9);
  };

  const drawBallista = () => {
    const x = W / 2;
    const y = keepTop - 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#3a2413';
    roundRect(ctx, -14, -3, 28, 8, 2);
    ctx.fill();
    ctx.rotate(aim + Math.PI / 2);
    ctx.translate(0, recoil * 5);
    ctx.fillStyle = '#6a4324';
    roundRect(ctx, -3.5, -25, 7, 29, 2);
    ctx.fill();
    ctx.strokeStyle = '#8a5a30';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-17, -9);
    ctx.quadraticCurveTo(0, -24, 17, -9);
    ctx.stroke();
    ctx.strokeStyle = '#e9e0cc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-17, -9);
    ctx.lineTo(0, -8 + recoil * -6);
    ctx.lineTo(17, -9);
    ctx.stroke();
    ctx.fillStyle = '#ffcf7a';
    ctx.beginPath();
    ctx.arc(0, -25, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
    ctx.restore();
  };

  const drawFloatText = (f: FloatText) => {
    const p = f.t / f.duration;
    const alpha = p > 0.7 ? (1 - p) / 0.3 : 1;
    const y = f.y - p * (f.panel ? 22 : 36);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${f.panel ? 16 : 17}px ${FONT}`;
    const mainWidth = ctx.measureText(f.text).width;
    ctx.font = `500 13px ${FONT}`;
    const subWidth = f.sub ? ctx.measureText(f.sub).width : 0;
    const halfWidth = Math.max(mainWidth, subWidth) / 2 + 12;
    const x = clamp(f.x, halfWidth + 4, Math.max(halfWidth + 4, W - halfWidth - 4));
    if (f.panel) {
      // The missed word is what the player needs to learn, so keep it readable over any background
      ctx.fillStyle = 'rgba(30, 8, 14, 0.9)';
      roundRect(ctx, x - halfWidth, y - 19, halfWidth * 2, f.sub ? 46 : 30, 6);
      ctx.fill();
      ctx.strokeStyle = '#ff6a4a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.font = `800 ${f.panel ? 16 : 17}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(15, 8, 25, 0.9)';
    if (!f.panel) ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, y - (f.panel ? 4 : 0));
    if (f.sub) {
      ctx.font = `500 13px ${FONT}`;
      ctx.fillStyle = '#fff1e0';
      if (!f.panel) ctx.strokeText(f.sub, x, y + 18);
      ctx.fillText(f.sub, x, y + (f.panel ? 14 : 18));
    }
    ctx.restore();
  };

  const drawBanner = () => {
    if (!banner) return;
    const p = banner.t / banner.duration;
    const pop = Math.min(1, banner.t / 0.22);
    const alpha = p > 0.82 ? (1 - p) / 0.18 : 1;
    const size = clamp(W * 0.075, 24, 44);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H * 0.36);
    ctx.scale(0.7 + pop * 0.3, 0.7 + pop * 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = '#14091f';
    ctx.strokeText(banner.text, 0, 0, W - 24);
    ctx.fillStyle = banner.color;
    ctx.fillText(banner.text, 0, 0, W - 24);
    ctx.restore();
  };

  const land = (shot: Shot) => {
    const colors = SHOT_COLORS[shot.tier];
    burst(shot.x1, shot.y1, 22 + shot.tier * 12, [colors.core, colors.glow, '#ffffff'], 190 + shot.tier * 40, 4.5);
    for (let i = 0; i < 4; i++) smoke(shot.x1 + random(-8, 8), shot.y1 + random(-8, 8), random(5, 9));
    rings.push({ x: shot.x1, y: shot.y1, t: 0, duration: 0.32, radius: 38 + shot.tier * 12, color: colors.glow });
    texts.push({ x: shot.x1, y: shot.y1 - 10, text: `+${shot.points}`, sub: shot.term, color: '#ffe27a', t: 0, duration: 0.95, panel: false });
    addShake(1.5 + shot.tier);
  };

  const update = (dt: number, lives: number) => {
    time += dt;
    shake = Math.max(0, shake - dt * 26);
    flash = Math.max(0, flash - dt * 2.2);
    recoil = Math.max(0, recoil - dt * 7);
    aim += (targetAim - aim) * Math.min(1, dt * 14);

    clouds.forEach((cloud) => {
      cloud.x += cloud.speed * dt;
      if (cloud.x > W + 60) cloud.x = -60;
    });

    // Fire spreads along the wall with each life lost
    FIRE_SPOTS.forEach((spot, i) => {
      if (lives > FIRE_SPOTS.length - 1 - i) return;
      for (let n = Math.ceil(dt * 70); n > 0; n--) flame(W * spot, wallTop + 6);
      if (Math.random() < dt * 5) smoke(W * spot, wallTop - 4, random(6, 11));
    });

    if (state === 'lost') {
      endedFor += dt;
      sink = Math.min(castleH * 0.45, sink + dt * castleH * 0.3);
      if (Math.random() < dt * 11) {
        const x = random(0, W), y = random(wallTop - 4, H - 6);
        burst(x, y, 14, ['#ffb13c', '#ff6a2a', '#ffe2a0'], 150, 5);
        for (let i = 0; i < 3; i++) smoke(x, y, random(7, 13));
        addShake(2.2);
      }
    }
    if (state === 'won') {
      fireworkIn -= dt;
      if (fireworkIn <= 0) {
        fireworkIn = random(0.14, 0.32);
        const palette = [['#ffe27a', '#ffffff'], ['#7fd8ff', '#ffffff'], ['#ff8fb3', '#ffe0ea'], ['#b4ff9a', '#ffffff']][Math.floor(Math.random() * 4)];
        burst(random(W * 0.12, W * 0.88), random(laneTop, wallTop * 0.62), 42, palette, 170, 3.6, 60);
      }
    }

    shots = shots.filter((shot) => {
      shot.t += dt;
      if (shot.t >= shot.duration) {
        land(shot);
        return false;
      }
      const p = shot.t / shot.duration;
      const colors = SHOT_COLORS[shot.tier];
      if (particles.length < MAX_PARTICLES) {
        particles.push({
          x: lerp(shot.x0, shot.x1, p), y: lerp(shot.y0, shot.y1, p), vx: random(-12, 12), vy: random(-12, 12),
          life: 0.24, max: 0.24, size: 3.5, color: colors.glow, gravity: 0, glow: true
        });
      }
      return true;
    });

    particles = particles.filter((particle) => {
      particle.life -= dt;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      return particle.life > 0;
    });
    rings = rings.filter((ring) => (ring.t += dt) < ring.duration);
    texts = texts.filter((text) => (text.t += dt) < text.duration);
    if (banner && (banner.t += dt) >= banner.duration) banner = null;
  };

  const render = (enemies: SceneEnemy[], lives: number, dt: number) => {
    if (!W || !H) return;
    update(dt, lives);

    // Aim at whichever imp is closest to the wall
    if (state === 'playing' && enemies.length) {
      const lead = enemies.reduce((a, b) => (b.y > a.y ? b : a));
      const pos = enemyPosition(lead);
      targetAim = Math.atan2(pos.y - (keepTop - 4), pos.x - W / 2);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(random(-shake, shake), random(-shake, shake));

    ctx.drawImage(background, 0, 0, W, H);
    stars.forEach((star) => {
      ctx.globalAlpha = 0.35 + (Math.sin(time * 1.6 + star.phase) + 1) * 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1;
    drawClouds();

    ctx.drawImage(castle, 0, sink, W, H);
    if (state !== 'lost' || sink < castleH * 0.2) {
      const towerW = clamp(keepW * 0.24, 22, 48);
      const flagTop = keepTop - castleH * 0.14 - 9 + sink;
      drawFlag(W / 2 - keepW / 2 + towerW * 0.1, flagTop, 0);
      drawFlag(W / 2 + keepW / 2 - towerW * 0.1, flagTop, 2);
      drawBallista();
    }
    drawTorch(W * 0.12, wallTop + 14 + sink, 0);
    drawTorch(W * 0.88, wallTop + 14 + sink, 2.1);

    // Scorched wall under each fire
    FIRE_SPOTS.forEach((spot, i) => {
      if (lives > FIRE_SPOTS.length - 1 - i) return;
      ctx.fillStyle = 'rgba(8, 4, 12, 0.32)';
      ctx.beginPath();
      ctx.ellipse(W * spot, wallTop + 12 + sink, 24, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    enemies.forEach((enemy) => drawEnemy(enemy));
    shots.forEach((shot) => { if (shot.ghost) drawEnemy(shot.ghost.enemy, shot.ghost); });

    particles.forEach((particle) => {
      const alpha = particle.life / particle.max;
      if (particle.glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (1.7 - alpha * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    rings.forEach((ring) => {
      const p = ring.t / ring.duration;
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius * p, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    shots.forEach((shot) => {
      const p = shot.t / shot.duration;
      const colors = SHOT_COLORS[shot.tier];
      const x = lerp(shot.x0, shot.x1, p), y = lerp(shot.y0, shot.y1, p);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = colors.glow;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.core;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    texts.forEach(drawFloatText);
    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 40, 30, ${flash * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state === 'lost') {
      ctx.fillStyle = `rgba(10, 4, 16, ${Math.min(0.55, endedFor * 0.4)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawBanner();
  };

  return {
    resize,
    render,
    showBanner: (text: string, color = '#ffe27a', duration = 1.2) => { banner = { text, color, t: 0, duration }; },
    fire: (enemy: SceneEnemy, term: string, points: number, combo: number) => {
      const pos = enemyPosition(enemy);
      const x0 = W / 2, y0 = keepTop - 28;
      targetAim = Math.atan2(pos.y - y0, pos.x - x0);
      recoil = 1;
      const tier = combo >= 10 ? 2 : combo >= 5 ? 1 : 0;
      const distance = Math.hypot(pos.x - x0, pos.y - y0);
      shots.push({ x0, y0, x1: pos.x, y1: pos.y, t: 0, duration: clamp(distance / 1100, 0.09, 0.24), tier, ghost: { enemy, ...pos }, term, points });
    },
    // A wrong answer still fires, so the mistake is felt on the field and not only in the input box
    misfire: () => {
      const x0 = W / 2, y0 = keepTop - 28;
      const x1 = x0 + random(-W * 0.28, W * 0.28), y1 = random(laneTop, wallTop * 0.5);
      recoil = 1;
      targetAim = Math.atan2(y1 - y0, x1 - x0);
      particles.push({ x: x0, y: y0, vx: (x1 - x0) * 1.4, vy: (y1 - y0) * 1.4, life: 0.5, max: 0.5, size: 2.4, color: '#a79db8', gravity: 110, glow: false });
    },
    crash: (enemy: SceneEnemy, term: string, meaning: string) => {
      const pos = enemyPosition(enemy);
      const y = wallTop - 2;
      burst(pos.x, y, 42, ['#ff6a2a', '#ffb13c', '#ffe2a0', '#ffffff'], 250, 6);
      for (let i = 0; i < 9; i++) smoke(pos.x + random(-20, 20), y + random(-6, 6), random(8, 15));
      rings.push({ x: pos.x, y, t: 0, duration: 0.45, radius: 72, color: '#ff6a2a' });
      texts.push({ x: pos.x, y: y - 26, text: term, sub: meaning, color: '#ff9c7d', t: 0, duration: 2.1, panel: true });
      addShake(9);
      if (!reducedMotion) flash = 1;
    },
    heal: () => {
      burst(W / 2, keepTop - 14, 30, ['#7dffb0', '#ffffff', '#c8ffd9'], 130, 3.6, -40);
      texts.push({ x: W / 2, y: keepTop - 36, text: '+1 mạng', color: '#8affb6', t: 0, duration: 1.2, panel: false });
    },
    win: () => {
      state = 'won';
      banner = { text: 'CHIẾN THẮNG!', color: '#ffe27a', t: 0, duration: 99 };
    },
    lose: () => {
      state = 'lost';
      banner = { text: 'THÀNH ĐÃ THẤT THỦ', color: '#ff8466', t: 0, duration: 99 };
      addShake(14);
    }
  };
};

export type DefenseScene = ReturnType<typeof createDefenseScene>;
