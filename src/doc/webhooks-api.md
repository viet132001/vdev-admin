# VDEV Webhooks & Realtime — cập nhật task theo thời gian thực *(đề xuất, chờ BE)*

Phạm vi: **chỉ Dự án nhóm** (`/api/team-projects`, `/api/team-tasks`). Không làm cho task cá nhân (`/api/tasks`) và Task Agent. Nền tảng ngoài được **đọc và cập nhật** task, **không tạo mới** (mục 5b). BE một instance, không Redis. Ký webhook theo Standard Webhooks.

## 1. Hiện trạng & vấn đề

- FE chỉ tải khi mở trang (`api.get(..., { noCache: true })`), không có SSE / WebSocket. Claude đổi trạng thái qua MCP hay người khác sửa task thì màn đang mở không biết cho đến khi tải lại.
- `/api/mcp` không giữ phiên, không có luồng SSE (`GET` ⇒ `405`), nên không dùng MCP để đẩy sự kiện được.
- Nền tảng khác (Slack, Jira, n8n, Zapier, bot nội bộ…) hiện chỉ lấy được dữ liệu bằng cách tự polling `GET /api/team-projects/:id/tasks`.
- Nguồn sự kiện đã có sẵn: `TeamTaskActivity` (`CREATED`, `STATUS`, `ASSIGNEEID`…, kèm `via`). Bình luận, tài liệu, xoá task chưa có sự kiện.

## 2. Kiến trúc: một luồng sự kiện, hai đầu ra

```
 mọi thay đổi (WEB, MCP, runner)
        │  ghi trong cùng transaction
        ▼
   TeamEvent (outbox)  ── id tăng dần = cursor
        │
        ├─► SSE  GET /api/team-projects/:id/events   → FE (realtime, đã đăng nhập)
        ├─► Webhook worker (POST có chữ ký, retry)   → nền tảng khác (push)
        └─► GET /api/team-projects/:id/events?after= → nền tảng khác (pull / bù sự kiện lỡ)
```

Chỉ **một** nơi sinh sự kiện (service ghi task / comment / doc), ghi vào bảng `TeamEvent` cùng transaction với thay đổi. Không để FE hay worker tự suy ra sự kiện, tránh lệch giữa các kênh.

### 2.1 Bảng mới

| Bảng | Ghi chú |
|---|---|
| `TeamEvent` | `id` (bigserial, cursor), `projectId`, `type`, `taskId?`, `actorId?`, `via` (`WEB`/`MCP`/`SYSTEM`), `data` (JSON, ảnh chụp task sau thay đổi + `changes[]`), `createdAt`. Giữ 30 ngày rồi dọn |
| `TeamWebhook` | `projectId`, `url` (https), `secretHash` + `secretEnc` (mã hoá, để ký), `events[]` (rỗng = tất cả), `sourceId?` (lọc theo source), `active`, `failureCount`, `disabledAt`, `createdBy` |
| `TeamWebhookDelivery` | `webhookId`, `eventId`, `attempt`, `status` (`PENDING`/`OK`/`FAILED`), `httpStatus`, `error`, `durationMs`, `nextAttemptAt`. Giữ 14 ngày |

### 2.2 Loại sự kiện

`task.created` · `task.updated` (kèm `changes`) · `task.status_changed` · `task.assigned` · `task.deleted` · `comment.created` · `comment.deleted` · `doc.saved` · `milestone.saved` · `member.joined`.
`task.updated` + `task.status_changed` có thể phát cùng lúc; người nhận lọc theo `events[]`. Có thêm `ping` (chỉ để thử).

### 2.3 Phong bì (envelope) chung

```json
{
  "id": "evt_8812",              // = TeamEvent.id, dùng làm khoá chống trùng
  "type": "task.status_changed",
  "createdAt": "2026-11-18T09:30:00Z",
  "project": { "id": "uuid", "key": "NEXQ" },
  "actor": { "id": "uuid", "fullName": "...", "via": "MCP" },
  "data": {
    "task": { /* Task card, xem team-projects-api.md 5.2 */ },
    "changes": [{ "field": "status", "from": "IN_PROGRESS", "to": "IN_REVIEW" }]
  }
}
```
Không gửi `description` dài / toàn văn tài liệu trong webhook nếu `webhook.lean = true`; người nhận gọi lại API (`GET /api/team-tasks/:ref`) khi cần. Mặc định gửi task card đầy đủ trừ `description`.

## 3. Kênh 1 — SSE cho FE

`GET /api/team-projects/:id/events` — quyền VIEWER, `Content-Type: text/event-stream`.

- Auth: JWT. `EventSource` của trình duyệt **không gửi được header `Authorization`**, nên FE dùng `fetch` + đọc `ReadableStream` qua `authFetch` (giữ cơ chế refresh token 401). Không đưa JWT vào query string.
- Khởi động lại: header `Last-Event-ID` (hoặc `?after=<id>`) ⇒ BE phát bù các sự kiện sau cursor đó, nhờ vậy mất mạng ngắn không mất cập nhật. Nếu cursor quá cũ (đã dọn) ⇒ gửi sự kiện `reset` và FE tải lại toàn bộ.
- Mỗi sự kiện: `id: <eventId>`, `event: <type>`, `data: <envelope>`. Gửi comment `: keepalive` mỗi 25 giây (proxy / Cloudflare cắt kết nối rảnh).
- BE chạy **một instance, không Redis**: dùng `EventEmitter` trong tiến trình để báo cho các kết nối SSE sau khi transaction ghi `TeamEvent` commit; `TeamEvent` vẫn là nguồn đúng (khởi động lại BE thì FE nối lại và bù bằng `Last-Event-ID`). Nếu sau này chạy nhiều instance thì thay `EventEmitter` bằng Postgres `LISTEN/NOTIFY`, không đổi API.
- Giới hạn: tối đa ~5 kết nối / user, đóng khi thu hồi quyền thành viên.

### 3.1 FE (khi BE xong)

- Hook `useProjectEvents(projectId, onEvent)` trong `src/pages/projects/shared.tsx`: mở stream khi vào dự án, đóng khi rời, tự nối lại với backoff 1 → 30 giây, gửi `Last-Event-ID`.
- `useTasks` áp sự kiện vào state tại chỗ (vá task theo `data.task`), không refetch cả danh sách. `TeamTaskPanel` đang mở thì cập nhật hoạt động / bình luận; nếu người dùng đang sửa field đó thì hiện báo "Task vừa được ... thay đổi" thay vì ghi đè.
- Mất stream quá lâu hoặc nhận `reset` ⇒ refetch một lần. Tận dụng `vdev:network-error` / `vdev:network-ok` của `authFetch` để nối lại.
- Trạng thái "Trực tiếp / Đang nối lại" nhỏ ở đầu trang dự án.
- Tuỳ chọn tạm thời, **không cần chờ BE**: polling nhẹ `GET /api/team-projects/:id/tasks` mỗi 15–30 giây khi tab đang hiển thị (`document.visibilityState`), dừng khi ẩn. Dùng làm phương án dự phòng sau này khi SSE hỏng.

## 4. Kênh 2 — Webhook cho nền tảng khác

### 4.1 Quản lý (JWT, MANAGER)

| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/team-projects/:id/webhooks` | Danh sách, không trả secret; có `failureCount`, `lastDelivery` |
| POST | `/api/team-projects/:id/webhooks` | `{ url, events?[], sourceId?, lean? }` ⇒ trả `secret` (`whsec_…`) **một lần** |
| PATCH | `/api/team-projects/:id/webhooks/:wid` | Đổi url / events / `active`; bật lại thì xoá `failureCount` |
| POST | `/api/team-projects/:id/webhooks/:wid/rotate-secret` | Secret mới, secret cũ vẫn hợp lệ 24 giờ để người nhận kịp đổi |
| POST | `/api/team-projects/:id/webhooks/:wid/test` | Gửi sự kiện `ping`, trả kết quả ngay |
| GET | `/api/team-projects/:id/webhooks/:wid/deliveries?status=` | Lịch sử gửi (mã HTTP, lỗi, thời gian) |
| POST | `/api/team-projects/:id/webhooks/:wid/deliveries/:did/redeliver` | Gửi lại |
| DELETE | `/api/team-projects/:id/webhooks/:wid` | |

### 4.2 Request BE gửi đi

`POST <url>`, `Content-Type: application/json`, timeout 10 giây, không theo redirect.

Theo chuẩn [Standard Webhooks](https://www.standardwebhooks.com/) để người nhận dùng thư viện có sẵn (Node, Python, Go, PHP…):

```
webhook-id: evt_8812                   # = id sự kiện, giữ nguyên qua các lần retry; khoá chống trùng
webhook-timestamp: 1763458200          # giây, Unix
webhook-signature: v1,<base64>         # HMAC-SHA256(key, `${webhook-id}.${webhook-timestamp}.${rawBody}`), base64
User-Agent: VDEV-Webhook/1
```
- Secret dạng `whsec_<base64>`; khoá ký là phần base64 đã giải mã.
- Khi xoay secret, `webhook-signature` chứa nhiều chữ ký cách nhau dấu cách (`v1,<mới> v1,<cũ>`) trong 24 giờ.
- Loại sự kiện nằm trong body (`type`), không có header riêng.

Người nhận phải: (1) xác minh chữ ký trên **body thô**, so sánh thời gian hằng số, (2) từ chối nếu `webhook-timestamp` lệch quá 5 phút (chống replay), (3) bỏ qua `webhook-id` đã xử lý (BE đảm bảo *ít nhất một lần*, có thể trùng và sai thứ tự; sắp theo id sự kiện), (4) trả `2xx` trong 10 giây rồi xử lý nền.

### 4.3 Retry & tự tắt

- Thành công = `2xx`. `410 Gone` ⇒ tắt webhook ngay. Còn lại (kể cả timeout, `5xx`, `429`) ⇒ thử lại: 10 giây, 1 phút, 5 phút, 30 phút, 2 giờ, 6 giờ, 24 giờ (tối đa 8 lần, tôn trọng `Retry-After`).
- Gửi tuần tự theo từng `webhookId + taskId` để giữ thứ tự sự kiện của cùng một task; khác task gửi song song.
- 20 lần lỗi liên tiếp hoặc lỗi suốt 3 ngày ⇒ `disabledAt`, gửi mail cho MANAGER, hiện cảnh báo ở FE.

### 4.4 Bảo mật (quan trọng nhất)

- **SSRF**: chỉ `https`; phân giải DNS rồi chặn IP loopback / private / link-local / metadata (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`); kiểm lại IP **tại thời điểm kết nối** (chống DNS rebinding); không theo redirect; giới hạn kích thước phản hồi đọc (vài KB).
- Secret ngẫu nhiên ≥ 32 byte, chỉ hiện một lần; lưu mã hoá (cần giá trị gốc để ký, nên không băm một chiều được).
- Webhook thuộc **dự án**, không thuộc user: sự kiện chỉ chứa dữ liệu của dự án đó; `sourceId` lọc thêm. Người tạo mất quyền MANAGER ⇒ webhook vẫn chạy nhưng hiển thị người tạo để rà soát.
- Giới hạn: tối đa 10 webhook / dự án, rate limit gửi (vd. 50 request / giây / webhook, gộp khi vượt).
- Không đưa email thành viên vào `data` nếu `lean = true`.

## 5. Kênh 3 — Pull cho nền tảng không mở được cổng nhận

`GET /api/team-projects/:id/events?after=<eventId>&limit=100&types=` ⇒ `{ events[], nextCursor }`, xác thực bằng token riêng.

- Là lưới an toàn cho webhook (người nhận lỡ một đợt thì kéo bù bằng cursor) và là cách đồng bộ ban đầu.

## 5b. Token tích hợp (máy gọi vào) — đọc và **cập nhật**, không tạo mới

Không dùng JWT của người dùng cho máy. Tạo loại token riêng `vdi_…` (khác `vdp_` của MCP), gắn **một dự án**, do MANAGER cấp:

| Method | Endpoint | Ghi chú |
|---|---|---|
| GET / POST / DELETE | `/api/team-projects/:id/integration-tokens` | `{ name, scopes[], expiresInDays? }`; trả token **một lần**; thu hồi có hiệu lực ngay |

`scopes`: `events:read`, `tasks:read`, `tasks:update`, `comments:write`. **Không có scope tạo task** và không có `DELETE`.

Endpoint dùng với token này (tiền tố `/api/integrations/v1`, chỉ trong dự án của token):

| Method | Endpoint | Scope | Ghi chú |
|---|---|---|---|
| GET | `/events?after=&limit=` | `events:read` | Kênh pull ở trên |
| GET | `/tasks`, `/tasks/:ref` | `tasks:read` | Như task card |
| PATCH | `/tasks/:ref` | `tasks:update` | Chỉ các trường: `title`, `description`, `acceptanceCriteria`, `doneCriteria`, `status`, `priority`, `assigneeId`, `milestoneId`, `startDate`, `dueDate`, `estimateHours`, `blockedReason`. Không đổi `sourceId`, không xoá task. `POST` task ⇒ `403` |
| POST | `/tasks/:ref/comments` | `comments:write` | `{ content }` |

Quy tắc:
- Giống MCP: **không đặt được `DONE` / `CANCELLED`** (`403`), người duyệt chốt trên web.
- Thay đổi ghi `via = API` và `TeamTaskActivity` kèm tên token.
- **Chống vòng lặp**: sự kiện do token X gây ra mang `actor.tokenId = X`; webhook của chính nền tảng đó (đăng ký kèm `integrationTokenId`) **không** nhận lại sự kiện này. Nền tảng vẫn nhận sự kiện do người khác gây ra.
- **Chống ghi đè**: `PATCH` nhận `If-Match: <updatedAt>` (hoặc `expectedUpdatedAt` trong body); lệch ⇒ `409`, nền tảng đọc lại rồi thử lại.
- Rate limit theo token (vd. 60 request / phút), `lastUsedAt` hiển thị ở FE.

## 6. UI quản lý trong FE (khi BE xong)

Thêm mục **Webhook** và **Token tích hợp** (tạo token `vdi_…`, chọn scope, hiện một lần, sao chép, thu hồi, `lastUsedAt`; cùng mẫu `McpConnectModal`) vào `ProjectSettings.tsx` (chỉ MANAGER, kiểm tra bằng `roleAtLeast`). Trên task đổi bởi nền tảng ngoài, hoạt động hiện "qua API (tên token)". Mục Webhook gồm:
- Danh sách webhook: url rút gọn, sự kiện, trạng thái (Hoạt động / Đã tắt do lỗi), lần gửi gần nhất.
- Form tạo (url, chọn sự kiện, source). Sau khi tạo hiện secret một lần kèm nút sao chép, cùng mẫu với `McpConnectModal` (token `vdp_`).
- Nút Gửi thử (`ping`), Xem lịch sử gửi (bảng mã HTTP, lỗi, nút Gửi lại), Xoay secret, Bật lại.
- Hộp ví dụ xác minh chữ ký (Node / Python ngắn) để người dùng dán cho bên nhận.
- Dùng `ConfirmDialog` khi xoá; lỗi qua `getErrorMessage`.

## 7. Thứ tự triển khai

1. `TeamEvent` + ghi sự kiện trong transaction ở mọi chỗ đổi task / comment / doc (WEB và MCP đều đi qua cùng service).
2. SSE + `useProjectEvents` ở FE (giá trị thấy ngay, không cần bên ngoài).
3. Webhook: bảng `TeamWebhook` / `TeamWebhookDelivery`, worker gửi (không Redis: vòng `setInterval` 2–5 giây quét `Delivery` có `nextAttemptAt <= now`, khoá dòng bằng `FOR UPDATE SKIP LOCKED`; một instance nên đủ), ký Standard Webhooks, retry, chống SSRF, API quản lý.
4. UI Webhook ở `ProjectSettings`.
5. Endpoint pull + token tích hợp `vdi_…` (đọc, cập nhật task, bình luận; không tạo).

## 8. Quyết định đã chốt

- BE một instance, không Redis ⇒ SSE bằng `EventEmitter`, queue webhook bằng bảng `Delivery` + vòng quét.
- Chỉ dự án nhóm; không làm cho task cá nhân và Task Agent (không có loại `agent.*`).
- Ký theo Standard Webhooks.
- Hai chiều ở mức **cập nhật** task (và bình luận); **không cho tạo mới** task, không xoá, không đổi source.

## 9. Điểm còn mở

- Có cho nền tảng ngoài đặt `DONE` không? Mặc định **không** (giống MCP); mở sau bằng scope riêng nếu cần.
- Có giữ `lean` làm mặc định (webhook không kèm `description`) không?
