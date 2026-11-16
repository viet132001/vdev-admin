// Asset-driven animation studio, served by the local vdev-video worker (scripts/assetStudio.ts there).
// ChatGPT makes the images, the user brings them back here; nothing goes through the BE.
import { WORKER_URL, call, type LessonJob } from '../dictation/lessonWorker';

export type AssetKind = 'character' | 'expression' | 'mouths' | 'background' | 'prop';
export const KIND_LABEL: Record<AssetKind, string> = { character: 'Nhân vật', expression: 'Biểu cảm', mouths: 'Hình miệng', background: 'Bối cảnh', prop: 'Đạo cụ' };

export interface AssetPart { name: string; file: string; width: number; height: number; pivot: { x: number; y: number } }
export interface AssetItem {
  id: string; kind: AssetKind; name: string; description: string; prompt: string; of: string | null; file: string | null; version: number;
  parts: AssetPart[]; rev: number; tolerance: number | null; problem: string | null; rig: { x: number; y: number; scale: number } | null;
}
export const DEFAULT_TOLERANCE = 60;
export const PART_LABEL: Record<string, string> = { closed: 'Ngậm', small: 'Hé', wide: 'Há to', round: 'Tròn', main: 'Ảnh' };
export interface BibleCharacter { id: string; name: string; role: string; look: string; voice: string }
export interface AssetBible { style: string; characters: BibleCharacter[]; backgrounds: { id: string; name: string; description: string }[]; props: { id: string; name: string; description: string }[] }
export interface AssetSeries { id: string; title: string; premise: string; createdAt: string; bible: AssetBible; items: AssetItem[] }
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
export const CAMERA_LABEL: Record<string, string> = { wide: 'Toàn cảnh', close: 'Cận người nói' };
export const MOVE_LABEL: Record<string, string> = { hold: 'Đứng yên', push: 'Tiến vào', pull: 'Lùi ra', drift: 'Trôi ngang' };
export const ACTION_LABEL: Record<string, string> = { none: 'Không', hop: 'Nhảy mừng', shake: 'Giận run', tremble: 'Sợ run', nod: 'Gật đầu' };
export const EXPRESSION_LABEL: Record<string, string> = { neutral: 'Bình thường', happy: 'Vui', sad: 'Buồn', angry: 'Giận', surprised: 'Ngạc nhiên', scared: 'Sợ' };

export interface ScriptShot {
  background: string; camera: 'wide' | 'close'; move: string;
  cast: { character: string; x: number; face: 1 | -1 }[];
  props: { id: string; x: number; y: number; scale: number; layer: 'back' | 'front' }[];
  speaker: string | null; text: string; expression: string;
  reactions: { character: string; expression: string }[]; action: string;
}
export interface AnimationScript { title: string; description: string; shots: ScriptShot[] }
export interface AnimationCatalog {
  characters: { id: string; name: string; role: string; voice: string; expressions: string[]; talks: boolean }[];
  backgrounds: { id: string; description: string }[];
  props: { id: string; description: string }[];
}
export type AnimationJob = Omit<LessonJob, 'animation'> & { animation?: { seriesId: string; script: AnimationScript } };

export const isAnimation = (job: LessonJob): job is AnimationJob => job.request?.kind === 'animation';
export const createAnimationJob = (seriesId: string, idea: string, note: string): Promise<AnimationJob> => call('/animation', 'POST', { seriesId, idea, note });
export const animationCatalog = (id: string): Promise<AnimationCatalog> => call(`/animation/${id}/catalog`, 'POST', {});
export const saveAnimationScript = (id: string, script: AnimationScript): Promise<AnimationJob> => call(`/animation/${id}/script`, 'POST', { script });
export const previewAnimationShot = async (id: string, shot: number, script: AnimationScript) => `${WORKER_URL}${(await call(`/animation/${id}/preview`, 'POST', { shot, script })).url}`;
