# VDEV Team Projects API — Dự án nhóm, lời mời, MCP

Module **dự án nhóm** (`src/modules/team`): nhiều thành viên cùng làm một dự án, mỗi dự án chia thành nhiều **source** (BE / AD / APP...), task gán cho người và source, có tài liệu Markdown, dashboard tiến độ và **remote MCP** để Claude Code của từng thành viên đọc / cập nhật task.

Tách biệt hoàn toàn với module Tasks cá nhân (`/api/tasks`, `/api/task-projects`) và Task Agent.

Quy ước chung giống `tasks-api.md`: phản hồi `{ success, data, message }`, lỗi `{ success:false, message, errorCode, errors }`, xoá = xoá mềm.

---

## 1. Phân quyền

Mọi API kiểm tra **thành viên dự án**. Không phải thành viên ⇒ `404` (không lộ dự án tồn tại).

| Vai trò | Quyền |
|---|---|
| `OWNER` | Mọi quyền, xoá dự án, phong / hạ `OWNER`. Dự án luôn còn ít nhất 1 OWNER |
| `MANAGER` | Sửa dự án, source, milestone; mời người (vai trò ≤ `MANAGER`); đổi vai trò / xoá người có vai trò thấp hơn mình; xoá task / tài liệu / bình luận của người khác |
| `MEMBER` | Tạo, sửa, đổi trạng thái mọi task; được giao task; bình luận; tạo / sửa tài liệu; xoá task / tài liệu / bình luận do mình tạo |
| `VIEWER` | Chỉ xem, không được giao task |

* **Tạo dự án:** chỉ user có system role `ADMIN`; người tạo là `OWNER`.
* Đổi một người thành `VIEWER` hoặc xoá khỏi dự án ⇒ task **đang mở** của họ về "chưa giao"; họ mất quyền ngay, kể cả qua MCP.
* `:id` của dự án nhận **UUID hoặc mã dự án** (`NEXQ`). `:ref` của task nhận **UUID hoặc mã task** (`NEXQ-12`, không phân biệt hoa thường).

## 2. Mô hình dữ liệu

| Bảng | Ghi chú |
|---|---|
| `TeamProject` | `key` (2–10 ký tự `A-Z0-9`, duy nhất, không đổi), `name`, `description` (Markdown), `startDate`, `targetDate`, `isArchived`, `taskSeq` |
| `TeamMember` | `(projectId, userId)` duy nhất, `role` |
| `TeamInvite` | `email` (chữ thường), `role`, `tokenHash` (SHA-256), `expiresAt` (7 ngày), `acceptedAt`, `revokedAt`, `emailSentAt`, `emailError` |
| `TeamSource` | `key` (`A-Z0-9_-`, ≤ 16, duy nhất trong dự án), `name`, `description` (ghi chú cho AI), `repoUrl`, `techStack`, `leadId` |
| `TeamMilestone` | `name`, `description`, `startDate`, `dueDate` |
| `TeamTask` | `number` (mã `KEY-number`), `title`, `description` (Markdown), `acceptanceCriteria[]`, `status`, `priority`, `sourceId`, `milestoneId`, `assigneeId`, `reporterId`, `startDate`, `dueDate`, `estimateHours`, `completedAt`, `blockedReason` |
| `TeamTaskComment` | `content` (Markdown), `via` (`WEB` / `MCP`) |
| `TeamTaskActivity` | Lịch sử: `action` (`CREATED`, `STATUS`, `ASSIGNEEID`, `PRIORITY`, `SOURCEID`, `MILESTONEID`, `DUEDATE`, `STARTDATE`, `TITLE`), `fromValue`, `toValue`, `via` |
| `TeamDoc` | Tài liệu Markdown: `title`, `content`, `url`, gắn `taskId` và/hoặc `sourceId` (không gắn = tài liệu chung) |
| `PersonalAccessToken` | Token MCP `vdp_…`: `name`, `prefix`, `tokenHash`, `expiresAt`, `lastUsedAt`, `revokedAt` |

**Trạng thái task** (`TeamTaskStatus`): `TODO` (Cần làm) · `IN_PROGRESS` (Đang làm) · `IN_REVIEW` (Chờ review) · `BLOCKED` (Bị chặn) · `DONE` · `CANCELLED` (Đã huỷ).
* Task "đang mở" = `TODO / IN_PROGRESS / IN_REVIEW / BLOCKED`. Trễ hạn = đang mở và `dueDate` < hôm nay.
* `completedAt` tự đặt khi vào `DONE`, tự xoá khi rời `DONE`. `blockedReason` tự xoá khi rời `BLOCKED`.
* **Qua MCP không đặt được `DONE` / `CANCELLED`** (`403`): Claude dừng ở `IN_REVIEW`, người duyệt chốt trên web.
* Tiến độ (%) = `DONE` / (tổng − `CANCELLED`).

## 3. Dự án (`/api/team-projects`) — JWT người dùng

| Method | Endpoint | Quyền | Body / ghi chú |
|---|---|---|---|
| GET | `/api/team-projects?includeArchived=false` | thành viên | Dự án của tôi, mỗi dự án có `myRole`, `memberCount`, `myOpenTaskCount`, `stats` (xem 7) |
| POST | `/api/team-projects` | system `ADMIN` | `{ key, name, description?, color?, startDate?, targetDate?, sources?: [{ key, name, description?, repoUrl?, techStack? }] }`. Trùng `key` ⇒ `409` |
| GET | `/api/team-projects/:id` | VIEWER | Dự án + `myRole`, `members[] { userId, role, fullName, email, joinedAt }`, `sources[]` (kèm `lead`), `milestones[]` (kèm `taskCount`, `doneCount`) |
| PATCH | `/api/team-projects/:id` | MANAGER | `name`, `description`, `color`, `startDate`, `targetDate` (`null` để xoá), `isArchived` |
| DELETE | `/api/team-projects/:id` | OWNER | Xoá mềm |
| GET | `/api/team-projects/:id/stats` | VIEWER | Dashboard (mục 7) |
| POST | `/api/team-projects/:id/sources` | MANAGER | `{ key, name, description?, repoUrl?, techStack?, leadId? }` — `leadId` phải là MEMBER+ |
| PATCH / DELETE | `/api/team-projects/:id/sources/:sourceId` | MANAGER | Xoá source: task / tài liệu giữ lại, bỏ liên kết |
| POST | `/api/team-projects/:id/milestones` | MANAGER | `{ name, description?, startDate?, dueDate? }` |
| PATCH / DELETE | `/api/team-projects/:id/milestones/:milestoneId` | MANAGER | |
| PATCH | `/api/team-projects/:id/members/:userId` | MANAGER | `{ role }` |
| DELETE | `/api/team-projects/:id/members/:userId` | MANAGER, hoặc chính mình (rời dự án) | OWNER cuối cùng không rời / bị hạ được (`400`) |

## 4. Lời mời

### 4.1 Người quản lý (JWT, MANAGER)
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/team-projects/:id/invites` | Lời mời chưa nhận / chưa thu hồi, có `state`: `PENDING / EXPIRED` |
| POST | `/api/team-projects/:id/invites` | `{ email, role? = MEMBER }`. Email đã là thành viên ⇒ `409`. Mời lại cùng email ⇒ link cũ bị thu hồi. Phản hồi thêm `inviteUrl` (link đầy đủ, **chỉ trả lần này**) và `emailSent` |
| POST | `/api/team-projects/:id/invites/:inviteId/resend` | Tạo link mới, gửi lại mail |
| DELETE | `/api/team-projects/:id/invites/:inviteId` | Thu hồi |

Link mời: `${FRONTEND_URL}/invite/vdi_…`. Mail gửi qua SMTP (mục 8); gửi lỗi **không** làm hỏng lời mời — `emailError` được lưu, người mời copy `inviteUrl` gửi tay.

### 4.2 Người được mời
| Method | Endpoint | Auth | Ghi chú |
|---|---|---|---|
| GET | `/api/team-invites/token/:token` | **công khai** | `{ email, role, state, expiresAt, project: { key, name }, invitedBy }` |
| POST | `/api/team-invites/token/:token/accept` | JWT | Email đăng nhập phải **trùng** email được mời (`403`). Thu hồi / hết hạn / đã dùng ⇒ `410`. Đã là thành viên ⇒ trả `alreadyMember: true` |
| GET | `/api/team-invites/mine` | JWT | Lời mời `PENDING` gửi tới email của tôi (khi mất mail) |
| POST | `/api/team-invites/:id/accept` | JWT | Như trên, theo id |
| POST | `/api/team-invites/:id/decline` | JWT | Từ chối |

Luồng FE: mở link ⇒ chưa đăng nhập thì lưu đường dẫn vào `sessionStorage` (`vdev_after_login`) ⇒ "Tiếp tục với Google" ⇒ quay lại trang mời ⇒ "Tham gia dự án".

## 5. Task

| Method | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/team-projects/:id/tasks?status=&sourceId=&assigneeId=&milestoneId=&q=` | VIEWER | `sourceId` / `milestoneId` nhận `none`; `assigneeId` nhận `me` / `none`; `q` tìm trong tiêu đề, mô tả, mã task. Không phân trang (tối đa 2000), sắp theo ưu tiên → deadline → số |
| POST | `/api/team-projects/:id/tasks` | MEMBER | Một task (5.1) |
| POST | `/api/team-projects/:id/tasks/bulk` | MEMBER | `{ tasks: [5.1] }`, 1–50 task, mã liên tiếp |
| GET | `/api/team-tasks/:ref` | VIEWER | Task card + `source` đầy đủ, `myRole`, `comments[]`, `activity[]` (50 mới nhất), `docs[] { id, title, url, updatedAt }` |
| PATCH | `/api/team-tasks/:ref` | MEMBER | Mọi trường của 5.1 + `blockedReason`; `null` để xoá ngày / người làm / source / milestone. Ghi `TeamTaskActivity` cho trường thay đổi |
| DELETE | `/api/team-tasks/:ref` | người tạo hoặc MANAGER | |
| GET / POST | `/api/team-tasks/:ref/comments` | VIEWER / MEMBER | `{ content }` |
| DELETE | `/api/team-tasks/:ref/comments/:commentId` | người viết hoặc MANAGER | |

### 5.1 Body tạo task
```json
{
  "title": "API đăng nhập Google",
  "description": "## Bối cảnh\n...\n## Yêu cầu\n...\n## Hướng dẫn kỹ thuật\n...",
  "acceptanceCriteria": ["Trả JWT + refresh token", "Email chưa xác minh bị từ chối"],
  "status": "TODO", "priority": "HIGH",
  "sourceId": "uuid", "milestoneId": "uuid", "assigneeId": "uuid",
  "startDate": "2026-11-10", "dueDate": "2026-11-15", "estimateHours": 6
}
```
Chỉ `title` bắt buộc. `assigneeId` phải là thành viên MEMBER+, `sourceId` / `milestoneId` phải thuộc dự án.

### 5.2 Task card
```json
{
  "id": "uuid", "key": "NEXQ-12", "number": 12, "projectId": "uuid",
  "title": "...", "description": "...", "acceptanceCriteria": ["..."],
  "status": "IN_PROGRESS", "priority": "HIGH", "blockedReason": null,
  "source": { "id": "uuid", "key": "BE", "name": "Backend" },
  "milestone": { "id": "uuid", "name": "Sprint 1", "dueDate": "..." },
  "assignee": { "id": "uuid", "fullName": "...", "email": "..." },
  "reporter": { "id": "uuid", "fullName": "...", "email": "..." },
  "startDate": null, "dueDate": "...", "estimateHours": 6, "completedAt": null,
  "isOverdue": false, "commentCount": 2, "docCount": 1, "createdAt": "...", "updatedAt": "..."
}
```

## 6. Tài liệu

| Method | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/team-projects/:id/docs?taskId=&sourceId=` | VIEWER | Không kèm `content`, có `size`, `task { key }`, `source { key }` |
| POST | `/api/team-projects/:id/docs` | MEMBER | `{ title, content?, url?, taskId?, sourceId? }` |
| GET | `/api/team-docs/:id` | VIEWER | Kèm `content`, `createdBy`, `updatedBy` |
| PATCH | `/api/team-docs/:id` | MEMBER | |
| DELETE | `/api/team-docs/:id` | người tạo hoặc MANAGER | |

MCP `get_task` gửi kèm **toàn văn** tài liệu của task và tài liệu gắn source của task (không gắn task).

## 7. Dashboard — `GET /api/team-projects/:id/stats`

```json
{
  "project": { "id", "key", "name", "targetDate" },
  "overall": GroupStats,
  "sources": [ { "sourceId", "key", "name", "lead", ...GroupStats, "assignees": [ { "assigneeId", ...GroupStats } ] } ],
  "members": [ { "userId", "fullName", "email", "role", ...GroupStats } ],
  "milestones": [ { "milestoneId", "name", "startDate", "dueDate", "isLate", ...GroupStats } ],
  "overdue": [TaskBrief], "dueSoon": [TaskBrief], "blocked": [TaskBrief],
  "weekly": [ { "weekStart", "created", "completed" } ]
}
```
* `GroupStats` = `{ total, done, overdue, progress, openEstimateHours, byStatus: { TODO, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE, CANCELLED } }`.
* `sources` / `members` có thêm nhóm `sourceId: null` ("Chưa gắn source") / `userId: null` ("Chưa giao") nếu có task như vậy.
* `dueSoon` = đang mở, hạn trong 7 ngày tới. `weekly` = 8 tuần gần nhất (thứ Hai đầu tuần, tuần hiện tại cuối mảng).
* `TaskBrief` = `{ id, key, title, status, priority, dueDate, sourceId, assigneeId }`.

## 8. Gửi mail (SMTP)

`src/modules/mail` (nodemailer). Biến môi trường:

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `465` | |
| `SMTP_SECURE` | `true` | `false` cho cổng 587 (STARTTLS) |
| `SMTP_USER` | — | Địa chỉ Gmail |
| `SMTP_PASS` | — | **App Password** 16 ký tự (myaccount.google.com/apppasswords, cần bật xác minh 2 bước) |
| `MAIL_FROM` | `SMTP_USER` | vd. `"VDEV <you@gmail.com>"` |

Thiếu `SMTP_USER` / `SMTP_PASS` ⇒ không gửi, `emailError = "SMTP chưa được cấu hình trên server"`. Gmail giới hạn khoảng 500 mail/ngày.

## 9. Remote MCP

### 9.1 Token cá nhân (JWT)
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/access-tokens` | Token còn hiệu lực (`prefix`, `lastUsedAt`, `expiresAt`) |
| POST | `/api/access-tokens` | `{ name, expiresInDays? }` ⇒ trả `token` (`vdp_…`) **một lần**. Tối đa 20 token / user |
| DELETE | `/api/access-tokens/:id` | Thu hồi, có hiệu lực ngay |

Token `vdp_…` **chỉ** dùng cho `/api/mcp`; gọi API web bằng nó ⇒ `401`. Ngược lại `/api/mcp` không nhận JWT.

### 9.2 Endpoint
`POST /api/mcp` — MCP Streamable HTTP, **không giữ phiên** (không có `Mcp-Session-Id`, không có luồng SSE: `GET` / `DELETE` ⇒ `405`). Mỗi POST là một JSON-RPC (hoặc một mảng); chỉ có notification ⇒ `202`. Phiên bản giao thức: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`. Hỗ trợ `initialize`, `ping`, `tools/list`, `tools/call` (`resources/list`, `prompts/list` trả rỗng).

Kết nối Claude Code:
```bash
claude mcp add --transport http vdev https://<BE>/api/mcp --header "Authorization: Bearer vdp_..."
```

### 9.3 Tool
Mọi tool chạy với quyền của chủ token (cùng luật mục 1), thay đổi ghi `via = MCP`. Lỗi nghiệp vụ trả `isError: true` kèm thông báo tiếng Việt (vd. source không tồn tại ⇒ liệt kê source có sẵn). Kết quả dạng Markdown.

| Tool | Tham số | Mô tả |
|---|---|---|
| `list_projects` | — | Dự án của tôi, vai trò, tiến độ, số task đang mở giao cho tôi |
| `project_overview` | `project` | Thành viên, milestone, **từng source → từng người → task đang mở** (trạng thái, hạn), trễ hạn, bị chặn |
| `list_tasks` | `project`, `source?`, `assignee?`, `status?`, `milestone?`, `query?`, `include_done?` | Mặc định chỉ task đang mở |
| `get_task` | `task` | Mô tả, tiêu chí (checklist), source (repo, công nghệ, ghi chú), milestone, toàn văn tài liệu, 20 bình luận gần nhất |
| `create_tasks` | `project`, `tasks[1–50] { title, description, acceptance_criteria, source, assignee, priority, start_date, due_date, milestone, estimate_hours }` | |
| `update_task` | `task`, `status? (TODO/IN_PROGRESS/IN_REVIEW/BLOCKED)`, `blocked_reason?`, `comment?`, + các trường như trên | `comment` được thêm sau khi cập nhật |
| `add_comment` | `task`, `content` | |
| `list_docs` / `get_doc` | `project`, `task?` / `doc_id` | |
| `save_doc` | `doc_id?` hoặc `project`, `title`, `content`, `url?`, `task?`, `source?` | Tạo mới hoặc sửa |
| `create_milestone` | `project`, `name`, `description?`, `start_date?`, `due_date?` | Cần MANAGER |

Giá trị dễ đọc: `project` = mã dự án; `task` = mã task; `source` = mã source (`BE`); `assignee` = email, `me` hoặc `none`; `milestone` = tên hoặc id; ngày `YYYY-MM-DD`, `none` để xoá.
