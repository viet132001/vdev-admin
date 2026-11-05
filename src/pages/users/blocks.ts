import { api, getErrorMessage } from '../../services/api';

export type BlockType = 'EMAIL' | 'IP';

const BASE = '/api/access-blocks';

const ERROR_MESSAGES: Record<string, string> = {
  'Account is blocked': 'Tài khoản này đã bị chặn.',
  'Access blocked': 'Địa chỉ IP của bạn đã bị chặn.',
  'Already blocked': 'Email hoặc IP này đã bị chặn từ trước.',
  'Invalid email': 'Email không hợp lệ.',
  'Invalid IP address': 'Địa chỉ IP không hợp lệ.',
  'Cannot block an admin': 'Không thể chặn quản trị viên. Hãy gỡ quyền quản trị trước.',
  'Cannot block a private IP address': 'Không thể chặn IP nội bộ, vì đó thường là IP của máy chủ proxy và sẽ chặn tất cả người dùng.',
  'Cannot block your own IP address': 'Không thể chặn IP bạn đang dùng.',
  'This IP address is used by an admin': 'IP này đang được một quản trị viên sử dụng.',
};

// The backend answers in English, the UI is Vietnamese
export const blockErrorMessage = (err: unknown, fallback: string) => {
  const message = getErrorMessage(err, fallback);
  return ERROR_MESSAGES[message] || message;
};

export const listBlocks = () => api.get(BASE, { noCache: true });

export const createBlock = (type: BlockType, value: string, reason?: string) =>
  api.post(BASE, { type, value, reason: reason || undefined });

export const removeBlock = (id: string) => api.delete(`${BASE}/${id}`);
