// Asset-driven animation studio, served by the local vdev-video worker (scripts/assetStudio.ts there).
// ChatGPT makes the images, the user brings them back here; nothing goes through the BE.
import { WORKER_URL, call, type LessonJob } from '../dictation/lessonWorker';

export type AssetKind = 'character' | 'body' | 'heads' | 'expression' | 'mouths' | 'background' | 'foreground' | 'prop';
export const KIND_LABEL: Record<AssetKind, string> = {
  character: 'Nhân vật', body: 'Bộ phận cơ thể', heads: 'Đầu và biểu cảm', expression: 'Biểu cảm (kiểu cũ)', mouths: 'Hình miệng', background: 'Bối cảnh', foreground: 'Tiền cảnh', prop: 'Đạo cụ'
};

export interface AssetPart { name: string; file: string; width: number; height: number; pivot: { x: number; y: number } }
export interface AssetItem {
  id: string; kind: AssetKind; name: string; description: string; prompt: string; of: string | null; file: string | null; version: number;
  parts: AssetPart[]; rev: number; tolerance: number | null; problem: string | null; rig: { x: number; y: number; scale: number } | null;
  skeleton: Skeleton | null; // body sheets only
}
// Must match JOINTS / DEFAULT_JOINTS / DEFAULT_HEAD_SCALE in vdev-video src/asset/rig.ts
export type JointName = 'neck' | 'shoulder' | 'hip' | 'elbow' | 'knee' | 'hand' | 'foot';
export interface Skeleton { joints: Record<JointName, { x: number; y: number }>; headScale: number }
export const DEFAULT_SKELETON: Skeleton = {
  joints: { neck: { x: 0.5, y: 0.03 }, shoulder: { x: 0.5, y: 0.13 }, hip: { x: 0.5, y: 0.94 }, elbow: { x: 0.5, y: 0.93 }, knee: { x: 0.5, y: 0.93 }, hand: { x: 0.5, y: 0.9 }, foot: { x: 0.5, y: 0.97 } },
  headScale: 0.42
};
// Which picture each joint is set on, and what it is in words
export const JOINT_INFO: Record<JointName, { part: string; label: string }> = {
  neck: { part: 'torso', label: 'Cổ: đầu gắn vào thân' }, shoulder: { part: 'torso', label: 'Vai' }, hip: { part: 'torso', label: 'Hông: chân gắn vào thân' },
  elbow: { part: 'arm', label: 'Khuỷu tay' }, knee: { part: 'thigh', label: 'Đầu gối' }, hand: { part: 'forearm', label: 'Bàn tay: chỗ cầm đồ' }, foot: { part: 'shin', label: 'Bàn chân: chỗ chạm đất' }
};
export const DEFAULT_TOLERANCE = 60;
export const PART_LABEL: Record<string, string> = {
  closed: 'Ngậm', small: 'Hé', wide: 'Há to', round: 'Tròn', main: 'Ảnh',
  torso: 'Thân', arm: 'Bắp tay', forearm: 'Cẳng tay', thigh: 'Đùi', shin: 'Cẳng chân', grip: 'Tay cầm',
  neutral: 'Bình thường', happy: 'Vui', sad: 'Buồn', angry: 'Giận', surprised: 'Ngạc nhiên', scared: 'Sợ', worried: 'Lo lắng', blink: 'Nhắm mắt'
};
export interface BibleCharacter { id: string; name: string; role: string; look: string; voice: string }
export interface AssetBible { style: string; characters: BibleCharacter[]; backgrounds: { id: string; name: string; description: string }[]; props: { id: string; name: string; description: string }[] }
export interface AssetSeries { id: string; title: string; premise: string; createdAt: string; bible: AssetBible; items: AssetItem[]; voices: Record<string, string> }
export interface AssetSummary { id: string; title: string; premise: string; ready: number; total: number; createdAt: string }

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const listAssetSeries = (): Promise<AssetSummary[]> => call('/assets/series');
export const getAssetSeries = (id: string): Promise<AssetSeries> => call(`/assets/series/${id}`);
export const createAssetSeries = (premise: string, note: string): Promise<AssetSeries> => call('/assets/series', 'POST', { premise, note });
export const uploadAsset = (id: string, item: string, image: string): Promise<AssetSeries> => call(`/assets/series/${id}/upload`, 'POST', { item, image });
export const reprocessAsset = (id: string, item: string, tolerance: number): Promise<AssetSeries> => call(`/assets/series/${id}/process`, 'POST', { item, tolerance });
export const setAssetPivot = (id: string, item: string, part: string, x: number, y: number): Promise<AssetSeries> => call(`/assets/series/${id}/pivot`, 'POST', { item, part, x, y });
export const setMouthRig = (id: string, item: string, x: number, y: number, scale: number): Promise<AssetSeries> => call(`/assets/series/${id}/rig`, 'POST', { item, x, y, scale });
export const DEFAULT_RIG = { x: 0.5, y: 0.17, scale: 0.12 };
export const setJoint = (id: string, item: string, joint: JointName, x: number, y: number): Promise<AssetSeries> => call(`/assets/series/${id}/joint`, 'POST', { item, joint, x, y });
export const setHeadScale = (id: string, item: string, scale: number): Promise<AssetSeries> => call(`/assets/series/${id}/head-scale`, 'POST', { item, scale });

// ElevenLabs voices of the account (read by the worker, the key never leaves it); NARRATOR is the storyteller's slot
export const NARRATOR = 'narrator';
export interface VoiceInfo { id: string; name: string; description: string; preview: string | null }
export const listVoices = (): Promise<VoiceInfo[]> => call('/assets/voices');
export const setVoices = (id: string, voices: Record<string, string>): Promise<AssetSeries> => call(`/assets/series/${id}/voices`, 'POST', { voices });
export const suggestVoices = (id: string): Promise<AssetSeries> => call(`/assets/series/${id}/suggest-voices`, 'POST', {});
// The task to paste into Claude Desktop: it draws the missing pictures (or the ones named) in ChatGPT and hands each to the worker
export const assetBrief = async (id: string, items: string[] = []): Promise<string> => (await call(`/assets/series/${id}/brief`, 'POST', { items })).text;
export const clearAsset = (id: string, item: string): Promise<AssetSeries> => call(`/assets/series/${id}/clear`, 'POST', { item });
export const addAsset = (id: string, kind: 'background' | 'prop', name: string, description: string): Promise<AssetSeries> => call(`/assets/series/${id}/add`, 'POST', { kind, name, description });
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
  none: 'Tay buông', point: 'Chỉ tay', wave: 'Vẫy tay', offer: 'Đưa / mời', drink: 'Uống', bow: 'Chắp tay cúi chào', chest: 'Tay lên ngực', think: 'Chống cằm', open: 'Giang tay', cover: 'Ôm mặt'
};
export const EFFECT_LABEL: Record<string, string> = { leaves: 'Lá rơi', petals: 'Cánh hoa', snow: 'Tuyết', rain: 'Mưa', fireflies: 'Đom đóm', dust: 'Bụi nắng', mist: 'Sương', embers: 'Tàn lửa', fluff: 'Bông lau bay' };
export const TONE_LABEL: Record<string, string> = { none: 'Tự nhiên', warm: 'Ấm', cool: 'Lạnh', dusk: 'Hoàng hôn', night: 'Đêm' };
export const LIGHT_LABEL: Record<string, string> = { lamp: 'Đèn dầu', fire: 'Bếp lửa', sun: 'Mặt trời', moon: 'Trăng' };

export interface ScriptMember { character: string; x: number; toX: number | null; face: 1 | -1; pose: string; gesture: string; hold: string | null }
export interface ScriptShot {
  background: string; camera: 'wide' | 'medium' | 'close'; subject: string | null; move: string; transition: 'cut' | 'fade';
  cast: ScriptMember[];
  props: { id: string; x: number; y: number; scale: number; layer: 'back' | 'front' }[];
  speaker: string | null; text: string; expression: string;
  reactions: { character: string; expression: string }[]; action: string;
  effects: string[]; tone: string; light: { kind: string; x: number; y: number } | null;
}
export interface AnimationScript { title: string; description: string; shots: ScriptShot[] }
export interface AnimationCatalog {
  characters: { id: string; name: string; role: string; voice: string; expressions: string[]; talks: boolean; rigged: boolean }[];
  backgrounds: { id: string; description: string; foreground: boolean }[];
  props: { id: string; description: string }[];
}
// Scripts saved before poses and narration existed (the worker fills the same defaults)
export const normalizeShot = (shot: any): ScriptShot => ({
  ...shot, subject: shot.subject ?? null, transition: shot.transition ?? 'cut', effects: shot.effects ?? [], tone: shot.tone ?? 'none', light: shot.light ?? null,
  cast: (shot.cast ?? []).map((m: any) => ({ toX: null, pose: 'stand', gesture: 'none', hold: null, ...m }))
});
export type AnimationJob = Omit<LessonJob, 'animation'> & { animation?: { seriesId: string; script: AnimationScript } };

export const isAnimation = (job: LessonJob): job is AnimationJob => job.request?.kind === 'animation';
export const createAnimationJob = (seriesId: string, idea: string, note: string): Promise<AnimationJob> => call('/animation', 'POST', { seriesId, idea, note });
export const animationCatalog = (id: string): Promise<AnimationCatalog> => call(`/animation/${id}/catalog`, 'POST', {});
export const saveAnimationScript = (id: string, script: AnimationScript): Promise<AnimationJob> => call(`/animation/${id}/script`, 'POST', { script });
export const previewAnimationShot = async (id: string, shot: number, script: AnimationScript) => `${WORKER_URL}${(await call(`/animation/${id}/preview`, 'POST', { shot, script })).url}`;
