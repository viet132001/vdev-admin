// Where the pieces of a rigged character go, for the live preview of the rig tuner. Same maths as forwardKinematics in
// vdev-video src/asset/rig.ts (the engine): change one, change the other, or the preview no longer shows the video.
import type { AssetPart, JointName, Limbs } from './animationWorker';

export interface Point { x: number; y: number }
export interface Angles { torso: number; head: number; armF: number; foreF: number; armB: number; foreB: number; thighF: number; shinF: number; thighB: number; shinB: number }
export const PREVIEW_POSES: Record<string, Angles> = {
  stand: { torso: 0, head: 0, armF: 6, foreF: 10, armB: -6, foreB: 8, thighF: 3, shinF: 2, thighB: -3, shinB: 2 },
  kneel: { torso: 4, head: 2, armF: 30, foreF: 45, armB: 24, foreB: 40, thighF: 86, shinF: 172, thighB: 82, shinB: 170 },
  point: { torso: 0, head: 0, armF: 82, foreF: 4, armB: -6, foreB: 8, thighF: 3, shinF: 2, thighB: -3, shinB: 2 },
  walk: { torso: 3, head: 0, armF: -18, foreF: 14, armB: 18, foreB: 14, thighF: 24, shinF: 6, thighB: -24, shinB: 40 }
};
export const POSE_NAMES: Record<string, string> = { stand: 'Đứng', kneel: 'Quỳ', point: 'Chỉ tay', walk: 'Bước đi' };

export interface Piece { part: string; x: number; y: number; rotate: number; sprite: AssetPart; scale: number; back: boolean }

const BACK_OFFSET = 0.07;
const rad = (deg: number) => (deg * Math.PI) / 180;
const turn = (p: Point, deg: number): Point => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const fromPivot = (sprite: AssetPart, at: Point): Point => ({ x: (at.x - sprite.pivot.x) * sprite.width, y: (at.y - sprite.pivot.y) * sprite.height });

// Limbs at a real body's length against the torso (neck to hip), as proportioned() in rig.ts does
const PROPORTION = { arm: 0.6, forearm: 0.62, thigh: 0.82, shin: 0.86 };
const fit = (sprite: AssetPart, end: Point, target: number, torso: number): AssetPart => {
  const now = Math.abs(end.y - sprite.pivot.y) * sprite.height;
  if (!(now > 0)) return sprite;
  const k = Math.min(1.6, Math.max(0.35, (target * torso) / now));
  return { ...sprite, width: sprite.width * k, height: sprite.height * k };
};

// Pieces back to front, lifted so the lowest knee or foot sits at y = 0; null until the sheets have the parts
export const placePieces = (drawn: Record<string, AssetPart>, head: AssetPart | undefined, joints: Record<JointName, Point>, headScale: number, a: Angles, limbs: Limbs = { arms: 1, legs: 1 }): { pieces: Piece[]; top: number } | null => {
  if (!drawn.torso || !drawn.arm || !drawn.forearm || !drawn.thigh || !drawn.shin || !head) return null;
  const torsoLength = Math.abs(joints.hip.y - joints.neck.y) * drawn.torso.height;
  const torso = drawn.torso;
  const arm = fit(drawn.arm, joints.elbow, PROPORTION.arm * limbs.arms, torsoLength), forearm = fit(drawn.forearm, joints.hand, PROPORTION.forearm * limbs.arms, torsoLength);
  const thigh = fit(drawn.thigh, joints.knee, PROPORTION.thigh * limbs.legs, torsoLength), shin = fit(drawn.shin, joints.foot, PROPORTION.shin * limbs.legs, torsoLength);
  const onTorso = (j: Point) => turn(fromPivot(torso, j), a.torso);
  const back = turn({ x: -BACK_OFFSET * torso.width, y: 0 }, a.torso);
  const shoulderF = onTorso(joints.shoulder), shoulderB = add(shoulderF, back);
  const hipF = fromPivot(torso, joints.hip), hipB = add(hipF, { x: -BACK_OFFSET * torso.width, y: 0 });
  const neck = onTorso(joints.neck);
  const limb = (top: Point, upper: AssetPart, lower: AssetPart, joint: Point, upperAbs: number, lowerAbs: number, end: Point) => {
    const mid = add(top, turn(fromPivot(upper, joint), upperAbs));
    return { mid, tip: add(mid, turn(fromPivot(lower, end), lowerAbs)) };
  };
  const armAbs = (n: number) => a.torso - n;
  const legAbs = (n: number) => -n;
  const armB = limb(shoulderB, arm, forearm, joints.elbow, armAbs(a.armB), armAbs(a.armB) - a.foreB, joints.hand);
  const legF = limb(hipF, thigh, shin, joints.knee, legAbs(a.thighF), legAbs(a.thighF) + a.shinF, joints.foot);
  const legB = limb(hipB, thigh, shin, joints.knee, legAbs(a.thighB), legAbs(a.thighB) + a.shinB, joints.foot);
  const armF = limb(shoulderF, arm, forearm, joints.elbow, armAbs(a.armF), armAbs(a.armF) - a.foreF, joints.hand);
  const scale = (headScale * torso.height) / head.height;
  const headTop = add(neck, turn({ x: 0, y: -head.pivot.y * head.height * scale }, a.torso + a.head));
  const ground = Math.max(legF.mid.y, legF.tip.y, legB.mid.y, legB.tip.y);
  const piece = (part: string, at: Point, rotate: number, sprite: AssetPart, isBack = false, s = 1): Piece => ({ part, x: at.x, y: at.y - ground, rotate, sprite, scale: s, back: isBack });
  const pieces = [
    piece('arm', shoulderB, armAbs(a.armB), arm, true),
    piece('forearm', armB.mid, armAbs(a.armB) - a.foreB, forearm, true),
    piece('thigh', hipB, legAbs(a.thighB), thigh, true),
    piece('shin', legB.mid, legAbs(a.thighB) + a.shinB, shin, true),
    piece('shin', legF.mid, legAbs(a.thighF) + a.shinF, shin),
    piece('thigh', hipF, legAbs(a.thighF), thigh),
    piece('torso', { x: 0, y: 0 }, a.torso, torso),
    piece('head', neck, a.torso + a.head, head, false, scale),
    piece('arm', shoulderF, armAbs(a.armF), arm),
    piece('forearm', armF.mid, armAbs(a.armF) - a.foreF, forearm)
  ];
  return { pieces, top: Math.min(headTop.y, ...pieces.map((p) => p.y)) - ground };
};
