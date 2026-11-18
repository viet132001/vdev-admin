# Prompt giao việc cho BE: realtime + webhook + token tích hợp

Dán nguyên phần dưới vào phiên Claude trong repo vdev-be. Contract đầy đủ ở `src/doc/webhooks-api.md` của vdev-admin (copy file đó sang BE hoặc đính kèm).

---

Làm tính năng **realtime + webhook cho Dự án nhóm** theo contract `webhooks-api.md` (đính kèm). Đọc kỹ file đó trước, đặc biệt mục 2 (kiến trúc), 4.4 (bảo mật) và 5b (token tích hợp).

**Ràng buộc**: BE chạy một instance, **không có Redis**. Chỉ Dự án nhóm (`/api/team-projects`, `/api/team-tasks`), không làm task cá nhân và Task Agent. Ký webhook theo chuẩn Standard Webhooks. Nền tảng ngoài được đọc và **cập nhật** task, **không tạo, không xoá**, không đặt `DONE` / `CANCELLED`.

**Làm theo thứ tự, mỗi bước build + chạy được rồi mới sang bước sau:**

1. **`TeamEvent` (outbox)**: bảng + migration. Một service duy nhất `emitTeamEvent(tx, {...})` gọi trong **cùng transaction** với mọi thay đổi task / comment / doc / milestone / member, ở cả đường WEB, MCP (`/api/mcp`) lẫn API tích hợp. Phong bì sự kiện theo mục 2.3. Job dọn sự kiện > 30 ngày.
2. **SSE** `GET /api/team-projects/:id/events` (VIEWER, JWT): `EventEmitter` trong tiến trình phát sau khi transaction commit; hỗ trợ `Last-Event-ID` / `?after=` (bù từ `TeamEvent`, cursor quá cũ ⇒ sự kiện `reset`); keepalive `: keepalive` mỗi 25 giây; tối đa 5 kết nối / user; đóng khi mất quyền. Nhớ tắt buffering (`X-Accel-Buffering: no`, `Cache-Control: no-cache`) và không nén response. Cùng đường dẫn nhưng khi gọi bằng token `vdi_` có scope `events:read` thì trả JSON `{ events[], nextCursor }` (pull, mục 5).
3. **Webhook** (mục 4): bảng `TeamWebhook`, `TeamWebhookDelivery`; API quản lý (MANAGER) gồm tạo / sửa / xoá / test (`ping`) / xoay secret (giữ secret cũ 24 giờ) / lịch sử gửi / gửi lại. Worker không Redis: vòng `setInterval` 2–5 giây lấy delivery tới hạn bằng `FOR UPDATE SKIP LOCKED`, gửi tuần tự theo `webhookId + taskId`, retry 10s / 1p / 5p / 30p / 2h / 6h / 24h (tôn trọng `Retry-After`), tự tắt sau 20 lần lỗi liên tiếp hoặc 3 ngày và gửi mail cho MANAGER, `410` tắt ngay. Header theo Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`), secret `whsec_<base64>`. Thêm trường `lean` (bỏ `description` và email). Phản hồi `GET` danh sách trả `lastDelivery`, `failureCount`, `disabledAt`.
4. **Chống SSRF** (bắt buộc, có test): chỉ https; phân giải DNS và chặn IP loopback / private / link-local / metadata / IPv6 ULA; kiểm lại IP lúc kết nối (chống DNS rebinding); không theo redirect; timeout 10 giây; giới hạn đọc phản hồi vài KB.
5. **Token tích hợp `vdi_…`** (mục 5b): bảng, API MANAGER `/api/team-projects/:id/integration-tokens` (GET / POST / DELETE; token hiện một lần, lưu băm, có `scopes`, `prefix`, `lastUsedAt`, `expiresAt`), và nhóm `/api/integrations/v1` gồm `GET /events`, `GET /tasks`, `GET /tasks/:ref`, `PATCH /tasks/:ref` (chỉ các trường liệt kê trong 5b, hỗ trợ `If-Match: <updatedAt>` ⇒ `409`), `POST /tasks/:ref/comments`. `POST` tạo task và `DELETE` ⇒ `403`. Ghi `via = API` + tên token vào `TeamTaskActivity`. Chống vòng lặp: sự kiện do token X gây ra không gửi tới webhook gắn với X. Rate limit theo token.

**Khi xong**: cập nhật `src/doc/team-projects-api.md` (mô hình dữ liệu, `via = API`), viết test cho ký / xác minh chữ ký, SSRF, retry, `If-Match`, quyền theo scope, và báo lại những chỗ khác contract để FE (`src/pages/projects/live.ts`, `IntegrationSettings.tsx`) chỉnh theo. FE đã dựng sẵn và đang tự rơi về polling 20 giây cho tới khi `GET /api/team-projects/:id/events` trả khác 404 / 405 / 501.

Các tên trường FE đang đọc từ API (nếu đổi thì báo): webhook `{ id, url, events[], sourceId, lean, active, disabledAt, failureCount, lastDelivery { status, createdAt } }`, tạo / xoay trả `{ secret }`, test trả `{ ok, httpStatus?, error? }`, delivery `{ id, eventId, eventType, attempt, status, httpStatus, error, durationMs, nextAttemptAt, createdAt }`, token tích hợp `{ id, name, prefix, scopes[], lastUsedAt, expiresAt }` và tạo trả `{ token }`; sự kiện SSE `data` là phong bì mục 2.3 (FE đọc `type` và `data.task.key`).
