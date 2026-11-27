// Asset-driven animation studio, served by the local vdev-video worker (scripts/assetStudio.ts there).
// ChatGPT makes the images, the user brings them back here; nothing goes through the BE.
import { WORKER_URL, call, type LessonJob } from '../dictation/lessonWorker';

export type AssetKind = 'character' | 'body' | 'hands' | 'heads' | 'expression' | 'mouths' | 'background' | 'foreground' | 'prop' | 'plant' | 'animal' | 'action';
export const KIND_LABEL: Record<AssetKind, string> = {
  character: 'Nhân vật', body: 'Bộ phận cơ thể', hands: 'Bàn tay (ngón cử động)', heads: 'Đầu và biểu cảm', expression: 'Biểu cảm (kiểu cũ)', mouths: 'Hình miệng', background: 'Bối cảnh', foreground: 'Tiền cảnh', prop: 'Đạo cụ', plant: 'Cây cỏ chuyển động', animal: 'Con vật', action: 'Động tác vẽ sẵn'
};

export interface AssetPart { name: string; file: string; width: number; height: number; pivot: { x: number; y: number } }
export interface AssetItem {
  view?: string | null; // a character's pictures facing another way
  id: string; kind: AssetKind; name: string; description: string; prompt: string; of: string | null; file: string | null; version: number;
  parts: AssetPart[]; rev: number; tolerance: number | null; problem: string | null; rig: { x: number; y: number; scale: number } | null;
  skeleton: Skeleton | null; // body sheets only
  decor: DecorSpot[] | null; // backgrounds only: the plants in it
  heightCm: number | null; // characters, props, plants: real height, which sizes them against each other
  horizon: number | null; // backgrounds only: eye level, 0..1 from the top
  deck?: number | null; // backgrounds only: it is water, a boat's deck sits on this line
  map?: SceneMap | null; // backgrounds only: ground, water, houses and seats marked on the picture
  style: string | null; // borrowed items: the style they were drawn in
  from: { series: string; item: string } | null;
  tags: string[];
  action?: string | null; // drawn actions: which movement
  marks?: PoseMark[] | null; // drawn actions: where each pose holds the weapon
  order?: number[] | null; // drawn walk: the poses as played, 0-based
  holdStyle?: HoldStyle | null; // props: how a hand holds it
  grounded?: boolean | null; // foregrounds: it painted the ground, the engine puts it behind the characters
}
export interface DecorSpot { id: string; x: number; y: number; scale: number; layer: 'back' | 'front'; phase: number }
// Must match JOINTS / DEFAULT_JOINTS / DEFAULT_HEAD_SCALE in vdev-video src/asset/rig.ts
export type JointName = 'neck' | 'shoulder' | 'hip' | 'elbow' | 'knee' | 'hand' | 'foot' | 'wrist' | 'ankle';
export interface Limbs { arms: number; legs: number }
export interface Skeleton { joints: Record<JointName, { x: number; y: number }>; headScale: number; limbs?: Limbs }
export const DEFAULT_SKELETON: Skeleton = {
  joints: { neck: { x: 0.5, y: 0.08 }, shoulder: { x: 0.5, y: 0.13 }, hip: { x: 0.5, y: 0.94 }, elbow: { x: 0.5, y: 0.93 }, knee: { x: 0.5, y: 0.93 }, hand: { x: 0.5, y: 0.9 }, foot: { x: 0.5, y: 0.97 }, wrist: { x: 0.5, y: 0.67 }, ankle: { x: 0.5, y: 0.86 } },
  headScale: 0.42
};
// Which picture each joint is set on, and what it is in words
export const JOINT_INFO: Record<JointName, { part: string; label: string }> = {
  neck: { part: 'torso', label: 'Cổ: đầu gắn vào thân' }, shoulder: { part: 'torso', label: 'Vai' }, hip: { part: 'torso', label: 'Hông: chân gắn vào thân' },
  elbow: { part: 'arm', label: 'Khuỷu tay' }, knee: { part: 'thigh', label: 'Đầu gối' }, hand: { part: 'forearm', label: 'Bàn tay: chỗ cầm đồ' }, foot: { part: 'shin', label: 'Bàn chân: chỗ chạm đất' }, wrist: { part: 'forearm', label: 'Cổ tay: chỗ nối bàn tay rời' }, ankle: { part: 'shin', label: 'Cổ chân: chỗ bàn chân gập' }
};
export const DEFAULT_TOLERANCE = 60;
export const PART_LABEL: Record<string, string> = {
  closed: 'Ngậm', small: 'Hé', wide: 'Há to', round: 'Tròn', main: 'Ảnh',
  relaxed: 'Thả lỏng', half: 'Nửa nắm', fist: 'Nắm', open: 'Xoè', point: 'Chỉ', pinch: 'Nhón', cup: 'Đỡ chén', rod: 'Cầm cần',
  torso: 'Thân', arm: 'Bắp tay', forearm: 'Cẳng tay', thigh: 'Đùi', shin: 'Cẳng chân', grip: 'Tay cầm',
  neutral: 'Bình thường', happy: 'Vui', sad: 'Buồn', angry: 'Giận', surprised: 'Ngạc nhiên', scared: 'Sợ', worried: 'Lo lắng', blink: 'Nhắm mắt'
};
export interface BibleCharacter { id: string; name: string; role: string; look: string; voice: string }
export interface AssetBible { styleTag?: string; style: string; characters: BibleCharacter[]; backgrounds: { id: string; name: string; description: string }[]; props: { id: string; name: string; description: string }[] }
export interface AssetSeries { id: string; title: string; premise: string; createdAt: string; bible: AssetBible; items: AssetItem[]; voices: Record<string, string>; practice?: Record<string, Record<string, 'ok' | 'bad'>> }
export interface AssetSummary { id: string; title: string; premise: string; ready: number; total: number; createdAt: string }

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const listAssetSeries = (): Promise<AssetSummary[]> => call('/assets/series');
export const getAssetSeries = (id: string): Promise<AssetSeries> => call(`/assets/series/${id}`);
export const createAssetSeries = (premise: string, note: string, reuse: boolean): Promise<AssetSeries> => call('/assets/series', 'POST', { premise, note, reuse });
export const uploadAsset = (id: string, item: string, image: string): Promise<AssetSeries> => call(`/assets/series/${id}/upload`, 'POST', { item, image });
export const reprocessAsset = (id: string, item: string, tolerance: number): Promise<AssetSeries> => call(`/assets/series/${id}/process`, 'POST', { item, tolerance });
export const setAssetPivot = (id: string, item: string, part: string, x: number, y: number): Promise<AssetSeries> => call(`/assets/series/${id}/pivot`, 'POST', { item, part, x, y });
export const setMouthRig = (id: string, item: string, x: number, y: number, scale: number): Promise<AssetSeries> => call(`/assets/series/${id}/rig`, 'POST', { item, x, y, scale });
export const DEFAULT_RIG = { x: 0.5, y: 0.17, scale: 0.12 };
export const setJoint = (id: string, item: string, joint: JointName, x: number, y: number): Promise<AssetSeries> => call(`/assets/series/${id}/joint`, 'POST', { item, joint, x, y });
export const setLimbs = (id: string, item: string, arms: number, legs: number): Promise<AssetSeries> => call(`/assets/series/${id}/limbs`, 'POST', { item, arms, legs });
// The plants growing in a background; a new seed lays them out again
export const setDecor = (id: string, item: string, plants: string[], seed: number): Promise<AssetSeries> => call(`/assets/series/${id}/decor`, 'POST', { item, plants, seed });
export const setHeadScale = (id: string, item: string, scale: number): Promise<AssetSeries> => call(`/assets/series/${id}/head-scale`, 'POST', { item, scale });

// Must match ADULT_CM / DEFAULT_HORIZON / GROUND_LINE in vdev-video src/asset/assetScript.ts
export const DEFAULT_HORIZON = 0.4;
export const GROUND_LINE = 0.86;
export const SIZED_KINDS: AssetKind[] = ['character', 'prop', 'plant', 'animal'];
export const setSize = (id: string, item: string, heightCm: number | null): Promise<AssetSeries> => call(`/assets/series/${id}/size`, 'POST', { item, heightCm });
export const suggestSizes = (id: string): Promise<AssetSeries> => call(`/assets/series/${id}/suggest-sizes`, 'POST', {});
export const setDeck = (id: string, item: string, deck: number | null): Promise<AssetSeries> => call(`/assets/series/${id}/deck`, 'POST', { item, deck });
// Must match src/asset/scene.ts in vdev-video; points are 0..1 of the picture
export type ZoneKind = 'ground' | 'water' | 'house' | 'block';
export type SpotKind = 'seat' | 'door' | 'table';
export const ZONE_LABEL: Record<ZoneKind, string> = { ground: 'Đất đi được', water: 'Nước', house: 'Nhà', block: 'Vật cản' };
export const SPOT_LABEL: Record<SpotKind, string> = { seat: 'Chỗ ngồi', door: 'Cửa', table: 'Mặt bàn' };
export interface SceneMap { zones: { kind: ZoneKind; points: [number, number][] }[]; spots: { kind: SpotKind; x: number; y: number }[] }
export const setSceneMap = (id: string, item: string, map: SceneMap | null): Promise<AssetSeries> => call(`/assets/series/${id}/map`, 'POST', { item, map });
export const setHorizon = (id: string, item: string, horizon: number): Promise<AssetSeries> => call(`/assets/series/${id}/horizon`, 'POST', { item, horizon });

// Backgrounds, props and plants of every series, to be reused instead of drawn again
export interface SharedAsset { series: string; seriesTitle: string; item: string; kind: AssetKind; name: string; description: string; heightCm: number | null; style: string; tags: string[]; holdStyle?: HoldStyle | null; file: string; usedBy: number; sheets?: { kind: AssetKind; ready: boolean }[] }
// Must match STYLES in vdev-video scripts/assetStudio.ts
export const ASSET_STYLES = ['Hoạt hình', 'Tả thực', '3D', 'Người que'];
// A weapon is not a kind of its own for the engine: a prop held like a sword, or one tagged so
export const WEAPON_TAG = 'vũ khí';
export const isWeapon = (asset: { kind: AssetKind; holdStyle?: HoldStyle | null; tags: string[] }) => asset.kind === 'prop' && (asset.holdStyle === 'sword' || asset.tags.includes(WEAPON_TAG));
// How the library is grouped, in this order
export const LIBRARY_KINDS: AssetKind[] = ['character', 'background', 'prop', 'animal', 'plant'];
export const listShared = (): Promise<SharedAsset[]> => call('/assets/shared');
export type HoldStyle = 'cup' | 'rod' | 'sword' | 'carry';
export const HOLD_LABEL: Record<HoldStyle, string> = { cup: 'Chén, vật cầm ngửa', rod: 'Gậy, cần câu', sword: 'Kiếm, vũ khí', carry: 'Xách (giỏ, đèn lồng)' };
export const setHoldStyle = (id: string, item: string, style: HoldStyle | null): Promise<AssetSeries> => call(`/assets/series/${id}/hold-style`, 'POST', { item, style });
// Must match ACTION_PRESETS in vdev-video src/asset/drawnActions.ts
export const ACTION_PRESET_LABEL: Record<string, string> = { walk: 'Đi bộ', slash: 'Chém (một tay)', thrust: 'Đâm (một tay)', 'pole-thrust': 'Đâm giáo / gậy (cán dài)', cast: 'Quăng cần câu', net: 'Quăng chài (lưới tự bung)', haul: 'Kéo lưới có cá', pull: 'Ghì kéo cần câu' };
export interface PoseMark { x: number | null; y: number | null; angle: number; behind: boolean; hand: string | null }
export const addDrawnAction = (id: string, character: string, action: string): Promise<AssetSeries> => call(`/assets/series/${id}/add-action`, 'POST', { character, action });
export const setPoseMark = (id: string, item: string, pose: number, mark: Partial<PoseMark>): Promise<AssetSeries> => call(`/assets/series/${id}/pose`, 'POST', { item, pose, mark });
export const setWalkOrder = (id: string, item: string, order: number[]): Promise<AssetSeries> => call(`/assets/series/${id}/order`, 'POST', { item, order });
export const removeDrawnAction = (id: string, item: string): Promise<AssetSeries> => call(`/assets/series/${id}/remove-action`, 'POST', { item });
export const setAssetMeta = (id: string, item: string, meta: { style?: string; tags?: string[] }): Promise<AssetSeries> => call(`/assets/series/${id}/meta`, 'POST', { item, ...meta });
export const setStyleTag = (id: string, styleTag: string): Promise<AssetSeries> => call(`/assets/series/${id}/style-tag`, 'POST', { styleTag });
export const borrowAsset = (id: string, from: string, item: string): Promise<AssetSeries> => call(`/assets/series/${id}/borrow`, 'POST', { from, item });

// The practice room: a silent video of one character doing every movement, and the user's verdicts
export interface PracticeState {
  status: 'none' | 'rendering' | 'done' | 'failed'; progress: number; url: string | null; error: string | null;
  motions: { id: string; label: string; start: number }[]; marks: Record<string, 'ok' | 'bad'>;
}
export const practiceStatus = (id: string, character: string): Promise<PracticeState> => call(`/assets/series/${id}/practice-status`, 'POST', { character });
export const startPractice = (id: string, character: string): Promise<PracticeState> => call(`/assets/series/${id}/practice`, 'POST', { character });
export const setPracticeMark = (id: string, character: string, motion: string, mark: 'ok' | 'bad' | null): Promise<AssetSeries> => call(`/assets/series/${id}/practice-mark`, 'POST', { character, motion, mark });

// ElevenLabs voices of the account (read by the worker, the key never leaves it); NARRATOR is the storyteller's slot
export const NARRATOR = 'narrator';
export interface VoiceInfo { id: string; name: string; description: string; preview: string | null }
export const listVoices = (): Promise<VoiceInfo[]> => call('/assets/voices');
export const setVoices = (id: string, voices: Record<string, string>): Promise<AssetSeries> => call(`/assets/series/${id}/voices`, 'POST', { voices });
// The line read in that voice (cached by the worker, so the same line again costs nothing); returns a playable URL
export const sampleVoice = async (voice: string, text: string): Promise<string> => `${WORKER_URL}${(await call('/assets/voices/sample', 'POST', { voice, text })).url}`;
export const suggestVoices = (id: string): Promise<AssetSeries> => call(`/assets/series/${id}/suggest-voices`, 'POST', {});
// The task to paste into Claude Desktop: it draws the missing pictures (or the ones named) in ChatGPT and hands each to the worker
export const assetBrief = async (id: string, items: string[] = []): Promise<string> => (await call(`/assets/series/${id}/brief`, 'POST', { items })).text;
export const clearAsset = (id: string, item: string): Promise<AssetSeries> => call(`/assets/series/${id}/clear`, 'POST', { item });
export const addAsset = (id: string, kind: 'background' | 'prop' | 'plant' | 'animal', name: string, description: string): Promise<AssetSeries> => call(`/assets/series/${id}/add`, 'POST', { kind, name, description });
export const deleteAssetSeries = (id: string): Promise<{ ok: true }> => call(`/assets/series/${id}/delete`, 'POST', {});

export const fileUrl = (seriesId: string, file: string) => `${WORKER_URL}/assets/files/${seriesId}/${file}`;
// What the thumbnail shows: the keyed result when there is one, else the upload as it came
export const assetUrl = (seriesId: string, item: AssetItem) => (item.parts[0] ? fileUrl(seriesId, item.parts[0].file) : item.file ? fileUrl(seriesId, item.file) : null);

export const readImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Chỉ nhận ảnh PNG, JPG hoặc WebP'));
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error('Ảnh lớn hơn 12MB, hãy giảm kích thước'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được ảnh'));
    reader.readAsDataURL(file);
  });

// ---------- videos: scripts Claude writes from a series' pictures (vdev-video scripts/animationStudio.ts) ----------
export const CAMERA_LABEL: Record<string, string> = { wide: 'Toàn cảnh', medium: 'Trung cảnh', close: 'Cận mặt' };
export const MOVE_LABEL: Record<string, string> = { hold: 'Đứng yên', push: 'Tiến vào', pull: 'Lùi ra', drift: 'Trôi nhẹ', pan: 'Lia ngang' };
export const TRANSITION_LABEL: Record<string, string> = { cut: 'Cắt', fade: 'Mờ dần' };
export const ACTION_LABEL: Record<string, string> = { none: 'Không', hop: 'Nhảy mừng', shake: 'Giận run', tremble: 'Sợ run', nod: 'Gật đầu' };
export const EXPRESSION_LABEL: Record<string, string> = { neutral: 'Bình thường', happy: 'Vui', sad: 'Buồn', angry: 'Giận', surprised: 'Ngạc nhiên', scared: 'Sợ', worried: 'Lo lắng' };
export const POSE_LABEL: Record<string, string> = { stand: 'Đứng', kneel: 'Quỳ', sit: 'Ngồi' };
export const GESTURE_LABEL: Record<string, string> = {
  none: 'Tay buông', point: 'Chỉ tay', wave: 'Vẫy tay', offer: 'Đưa / mời', drink: 'Uống', bow: 'Chắp tay cúi chào', chest: 'Tay lên ngực', think: 'Chống cằm', open: 'Giang tay', cover: 'Ôm mặt', guard: 'Thủ thế', slash: 'Chém', thrust: 'Đâm', cast: 'Quăng cần', pull: 'Ghì kéo', fish: 'Ngồi câu', row: 'Chèo thuyền', look: 'Nâng lên ngắm'
};
export const EFFECT_LABEL: Record<string, string> = { leaves: 'Lá rơi', petals: 'Cánh hoa', snow: 'Tuyết', rain: 'Mưa', fireflies: 'Đom đóm', dust: 'Bụi nắng', mist: 'Sương', embers: 'Tàn lửa', fluff: 'Bông lau bay', wind: 'Gió mạnh' };
export const TONE_LABEL: Record<string, string> = { none: 'Tự nhiên', warm: 'Ấm', cool: 'Lạnh', dusk: 'Hoàng hôn', night: 'Đêm' };
export const LIGHT_LABEL: Record<string, string> = { lamp: 'Đèn dầu', fire: 'Bếp lửa', sun: 'Mặt trời', moon: 'Trăng' };

export interface ScriptMember { character: string; x: number; toX: number | null; face: 1 | -1; pose: string; gesture: string; hold: string | null; y?: number | null; act?: string | null; turn?: number | null; toTurn?: number | null }
export interface ScriptShot {
  background: string; camera: 'wide' | 'medium' | 'close'; subject: string | null; move: string; transition: 'cut' | 'fade';
  cast: ScriptMember[];
  props: { id: string; x: number; y: number; scale: number; layer: 'back' | 'front'; depth?: number | null }[];
  speaker: string | null; text: string; expression: string;
  reactions: { character: string; expression: string }[]; action: string;
  effects: string[]; tone: string; light: { kind: string; x: number; y: number } | null;
}
export interface AnimationScript { title: string; description: string; shots: ScriptShot[] }
// Degrees of each view (VIEW_HEADING in vdev-video src/asset/skeleton.ts); every character has the side one
export const VIEW_TURNS: { view: string; degrees: number; label: string }[] = [
  { view: 'side', degrees: 90, label: 'Nghiêng' }, { view: 'quarter', degrees: 45, label: 'Ba phần tư' }, { view: 'front', degrees: 0, label: 'Chính diện' },
  { view: 'quarter-back', degrees: 135, label: 'Ba phần tư sau' }, { view: 'back', degrees: 180, label: 'Sau lưng' }
];
export interface AnimationCatalog {
  characters: { id: string; name: string; role: string; voice: string; expressions: string[]; talks: boolean; rigged: boolean; views?: string[]; heightCm?: number | null; actions?: { id: string; label: string; weapon: boolean }[] }[];
  backgrounds: { id: string; description: string; foreground: boolean }[];
  props: { id: string; description: string; heightCm?: number | null }[];
}
// Scripts saved before poses and narration existed (the worker fills the same defaults)
export const normalizeShot = (shot: any): ScriptShot => ({
  ...shot, subject: shot.subject ?? null, transition: shot.transition ?? 'cut', effects: shot.effects ?? [], tone: shot.tone ?? 'none', light: shot.light ?? null,
  cast: (shot.cast ?? []).map((m: any) => ({ toX: null, pose: 'stand', gesture: 'none', hold: null, y: null, act: null, turn: null, toTurn: null, ...m }))
});
export type AnimationJob = Omit<LessonJob, 'animation'> & { animation?: { seriesId: string; script: AnimationScript } };

export const isAnimation = (job: LessonJob): job is AnimationJob => job.request?.kind === 'animation';
export const createAnimationJob = (seriesId: string, idea: string, note: string, reuse: boolean): Promise<AnimationJob> => call('/animation', 'POST', { seriesId, idea, note, reuse });
export const animationCatalog = (id: string): Promise<AnimationCatalog> => call(`/animation/${id}/catalog`, 'POST', {});
export const saveAnimationScript = (id: string, script: AnimationScript): Promise<AnimationJob> => call(`/animation/${id}/script`, 'POST', { script });
export const previewAnimationShot = async (id: string, shot: number, script: AnimationScript) => `${WORKER_URL}${(await call(`/animation/${id}/preview`, 'POST', { shot, script })).url}`;
