# Workspace

Không gian làm việc của team: quản lý công việc, dự án nhóm và nội dung ở cùng một nơi. Đây là SPA gọi REST API của BE VDEV.

## Tính năng

- **Công việc (Tasks)**: bảng, danh sách, lịch; kế hoạch và chạy task bằng Claude (chỉ quản trị viên).
- **Dự án nhóm**: thành viên, mời qua email, task, kế hoạch, tài liệu, dashboard, kết nối MCP. Người được mời chỉ thấy dự án của mình.
- **Quản lý page, Studio, Truyện viễn tưởng**: công cụ tạo và đăng nội dung (chỉ quản trị viên).
- **Người dùng**: quản lý tài khoản, chặn email / IP (chỉ quản trị viên).
- Giao diện Sáng / Tối / Hệ thống, đổi trong Cài đặt (bấm vào avatar).

## Công nghệ

React 19, TypeScript, Vite, react-router-dom, lucide-react. Không dùng thư viện UI hay state manager.

## Chạy local

Yêu cầu Node 22 và pnpm 10.

```bash
pnpm install
pnpm dev        # http://localhost:5173/vdev-admin/
```

Tạo file `.env` nếu cần trỏ tới BE khác:

```
VITE_API_URL=http://localhost:3000
```

Khi không kết nối được BE, app hiện thông báo "Không thể kết nối đến máy chủ, vui lòng thử lại sau." và giữ nguyên phiên đăng nhập.

## Lệnh

| Lệnh | Việc làm |
| --- | --- |
| `pnpm dev` | Chạy dev server |
| `pnpm build` | Kiểm tra kiểu (`tsc -b`) và build ra `dist/` |
| `pnpm lint` | Kiểm tra bằng oxlint |
| `pnpm preview` | Xem bản build |

Dự án chưa có test; dùng `pnpm build` và `pnpm lint` để kiểm tra thay đổi.

## Deploy

Push lên `main` sẽ tự build và deploy lên GitHub Pages (`.github/workflows/main.yml`) dưới đường dẫn `/vdev-admin/`. Nếu đổi đường dẫn, sửa cùng lúc `base` trong `vite.config.ts` và `basename` trong `src/App.tsx`.

## Tài liệu

- [CLAUDE.md](CLAUDE.md): bản đồ code và quy ước.
- [DesignGuideline.md](DesignGuideline.md): chuẩn giao diện.
- `src/doc/`: đặc tả API của BE.
