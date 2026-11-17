import { api } from './api';

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// R2 secret keys must stay on the BE: the BE signs a short-lived PUT URL, the browser uploads straight to R2,
// then the profile is patched with the public URL. Contract: src/doc/auth-api.md section 8.
export const uploadAvatar = async (file: File): Promise<string> => {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  if (file.size > AVATAR_MAX_BYTES) throw new Error('Ảnh tối đa 2MB.');

  const signed = await api.post('/api/auth/avatar/upload-url', { contentType: file.type, size: file.size });
  const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error('Tải ảnh lên R2 thất bại (kiểm tra CORS của bucket).');
  await api.patch('/api/auth/avatar', { avatarUrl: signed.publicUrl });
  return signed.publicUrl;
};

// avatarFileId holds either a legacy file id or (new) a full public URL; only URLs can be shown directly
export const avatarSrc = (value?: string | null) => (value && /^https?:\/\//.test(value) ? value : null);
