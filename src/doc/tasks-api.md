# VDEV Task Management API Integration Guide

Tài liệu đặc tả API của **Task Module** (quản lý công việc kiểu Notion) cho Web Admin và App Client.

---

## 1. Thông tin Chung

* **Base URL:** `/api/tasks`, `/api/task-projects`, `/api/task-tags`
* **Xác thực:** Header `Authorization: Bearer <JWT_TOKEN>` cho tất cả API.
* **Quy tắc xóa:** Xóa mềm với `Task` (kèm toàn bộ task con) và `TaskProject` (kèm toàn bộ task trong project). Cột, view, tag, subtask, bình luận xóa vĩnh viễn.
* **Định dạng phản hồi:** `{ "success": true, "data": <payload>, "message": "Success" }`. Ví dụ bên dưới chỉ mô tả phần `data`.
* **Định dạng lỗi:** `{ "success": false, "message": "...", "errorCode": "NOT_FOUND | BAD_REQUEST | CONFLICT | ...", "errors": [] }`.
* **Tương thích ngược:** Các API `/api/tasks` cũ vẫn hoạt động; task không có `projectId` là task trong **Inbox**.

---

## 2. Mô hình dữ liệu (tóm tắt)

| Khái niệm | Tương đương Notion | Ghi chú |
|---|---|---|
| `TaskProject` | Một database / board | Có danh sách cột và view riêng |
| `TaskColumn` | Option của property Status | `category` quy về `TaskStatus` (PENDING / IN_PROGRESS / COMPLETED / CANCELLED) |
| `TaskView` | View (Board, Table, Calendar...) | `config` là JSON tự do do FE định nghĩa |
| `Task` | Một page / row | `parentId` để làm sub-item, `content` là JSON block của trang |
| `Subtask` | Checklist trong trang | Chỉ có title / isCompleted / deadline |
| `TaskTag` | Multi-select | Dùng chung cho mọi project của user, tên là duy nhất |
| `TaskComment` | Comment | |

### Enum

* `TaskStatus`: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
* `TaskPriority`: `NONE`, `LOW`, `MEDIUM`, `HIGH`, `URGENT` (sắp xếp theo đúng thứ tự này)
* `TaskViewType`: `BOARD`, `LIST`, `TABLE`, `CALENDAR`, `TIMELINE`

### Quy tắc đồng bộ trạng thái

* Task trong project luôn có `status = column.category` của cột chứa nó.
* Kéo task sang cột khác ⇒ `status` đổi theo cột.
* `PATCH /api/tasks/:id` với `status` mới ⇒ task được chuyển xuống cuối cột **đầu tiên** có `category` đó. Nếu project không có cột nào thuộc status đó, task nằm ở nhóm `unassigned`.
* Đổi `category` của cột ⇒ toàn bộ task trong cột đổi `status`.
* `completedAt` tự đặt khi task chuyển sang `COMPLETED`, tự xóa khi rời `COMPLETED`.

### Thứ tự (kéo-thả)

Mỗi danh sách (cùng `projectId` + `columnId` + `parentId`) sắp xếp theo `position` tăng dần. FE **không tự tính position** — chỉ gửi task nằm ngay trên (`prevId`) và ngay dưới (`nextId`) vị trí thả, server tự tính và tự đánh số lại khi cần.

---

## 3. Project (`/api/task-projects`)

### 3.1 Tạo project
* **Endpoint:** `POST /api/task-projects`
* **Payload:**
```json
{ "name": "Side project", "description": "...", "icon": "🚀", "color": "#6366F1" }
```
* **Phản hồi:** Project kèm 3 cột mặc định (`Cần làm` / `Đang làm` / `Hoàn thành`) và 1 view `Bảng` (BOARD).
```json
{
  "id": "uuid", "name": "Side project", "icon": "🚀", "color": "#6366F1",
  "position": 1024, "isArchived": false,
  "columns": [
    { "id": "uuid", "name": "Cần làm", "color": "#9CA3AF", "category": "PENDING", "position": 1024 },
    { "id": "uuid", "name": "Đang làm", "color": "#3B82F6", "category": "IN_PROGRESS", "position": 2048 },
    { "id": "uuid", "name": "Hoàn thành", "color": "#22C55E", "category": "COMPLETED", "position": 3072 }
  ],
  "views": [{ "id": "uuid", "name": "Bảng", "type": "BOARD", "config": null, "position": 1024 }]
}
```

### 3.2 Danh sách project (sidebar)
* **Endpoint:** `GET /api/task-projects?includeArchived=false`
* **Phản hồi:** Mảng project theo `position`, mỗi phần tử có thêm `taskCount`.

### 3.3 Sắp xếp project
* **Endpoint:** `PATCH /api/task-projects/reorder`
* **Payload:** `{ "ids": ["uuid-1", "uuid-2", "..."] }` (toàn bộ ID theo thứ tự mới)

### 3.4 Chi tiết / cập nhật / xóa
* `GET /api/task-projects/:id` — kèm `columns`, `views`.
* `PATCH /api/task-projects/:id` — `name`, `description`, `icon`, `color`, `isArchived`.
* `DELETE /api/task-projects/:id` — xóa mềm project và toàn bộ task bên trong.

### 3.5 Dữ liệu Kanban
* **Endpoint:** `GET /api/task-projects/:id/board`
* **Phản hồi:** Chỉ gồm task cấp cao nhất (`parentId = null`); task con hiển thị qua `childCount`.
```json
{
  "project": { "...": "như 3.4" },
  "columns": [
    {
      "id": "uuid", "name": "Cần làm", "category": "PENDING", "position": 1024,
      "tasks": [ { "...": "Task card (xem mục 5.0)" } ]
    }
  ],
  "unassigned": []
}
```

---

## 4. Cột & View

### 4.1 Cột (status)
| Method | Endpoint | Body / Query |
|---|---|---|
| POST | `/api/task-projects/:id/columns` | `{ "name": "Review", "color": "#F59E0B", "category": "IN_PROGRESS" }` |
| PATCH | `/api/task-projects/:id/columns/reorder` | `{ "ids": [...] }` |
| PATCH | `/api/task-projects/:id/columns/:columnId` | `name`, `color`, `category` |
| DELETE | `/api/task-projects/:id/columns/:columnId?moveToColumnId=uuid` | Task trong cột chuyển sang `moveToColumnId` (mặc định cột đầu tiên còn lại). Không thể xóa cột cuối cùng. Phản hồi: `{ "movedToColumnId": "uuid" }` |

### 4.2 View
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/task-projects/:id/views` | `{ "name": "Lịch", "type": "CALENDAR", "config": { "dateField": "deadline" } }` |
| PATCH | `/api/task-projects/:id/views/reorder` | `{ "ids": [...] }` |
| PATCH | `/api/task-projects/:id/views/:viewId` | `name`, `type`, `config` |
| DELETE | `/api/task-projects/:id/views/:viewId` | |

`config` không được server diễn giải — FE tự quy ước (gợi ý: `groupBy`, `filters`, `sorts`, `visibleProperties`, `dateField`).

---

## 5. Task (`/api/tasks`)

### 5.0 Task card (dùng trong list / board / calendar)
```json
{
  "id": "uuid",
  "title": "Thiết kế màn hình login",
  "description": null,
  "icon": "📝",
  "projectId": "uuid", "columnId": "uuid", "parentId": null,
  "status": "IN_PROGRESS", "priority": "HIGH",
  "startDate": "2026-10-20T00:00:00.000Z", "deadline": "2026-10-25T00:00:00.000Z",
  "completedAt": null, "position": 2048,
  "subtasks": [{ "id": "uuid", "title": "s1", "isCompleted": false, "deadline": null, "position": 1024 }],
  "tags": [{ "id": "uuid", "name": "bug", "color": "#EF4444" }],
  "subtaskProgress": { "total": 2, "completed": 0 },
  "childCount": 1,
  "commentCount": 3,
  "createdAt": "...", "updatedAt": "..."
}
```
Card **không** chứa `content` (để payload nhẹ); lấy `content` qua API chi tiết.

### 5.1 Tạo task
* **Endpoint:** `POST /api/tasks`
* **Payload:**
```json
{
  "title": "Thiết kế màn hình login",
  "projectId": "uuid",
  "columnId": "uuid",
  "parentId": "uuid",
  "status": "PENDING",
  "priority": "HIGH",
  "startDate": "2026-10-20",
  "deadline": "2026-10-25",
  "icon": "📝",
  "description": "Mô tả ngắn",
  "content": { "blocks": [] },
  "tagIds": ["uuid"],
  "subtasks": [{ "title": "s1" }, { "title": "s2", "deadline": "2026-10-22" }]
}
```
* Tất cả trừ `title` là tùy chọn. Không có `projectId` ⇒ task vào Inbox.
* Có `parentId` ⇒ task con kế thừa project của task cha (phải cùng project).
* Có `projectId` mà không có `columnId` ⇒ vào cột đầu tiên khớp `status` (hoặc cột đầu tiên nếu không gửi `status`).
* Task mới luôn được thêm vào cuối danh sách.

### 5.2 Danh sách task
* **Endpoint:** `GET /api/tasks`
* **Query:**

| Tham số | Mô tả |
|---|---|
| `page`, `limit` | Phân trang (mặc định 1, 20; tối đa 100) |
| `keyword` | Tìm trong title / description |
| `status`, `priority` | Lọc theo enum |
| `projectId` | ID project, hoặc `none` để lấy task Inbox |
| `columnId` | Lọc theo cột |
| `parentId` | ID task cha, hoặc `root` để chỉ lấy task cấp cao nhất |
| `tagId` | Lọc theo tag |
| `dueFrom`, `dueTo` | Khoảng deadline (bao gồm 2 đầu) |
| `sort` | `createdAt` (mặc định), `updatedAt`, `title`, `deadline`, `startDate`, `priority`, `position` |
| `order` | `asc` / `desc` (mặc định `desc`). Với `deadline`/`startDate`, giá trị rỗng luôn ở cuối |

* **Phản hồi:** `{ "data": [Task card], "total": 42, "page": 1, "limit": 20, "totalPages": 3 }`

### 5.3 Lịch (calendar / timeline)
* **Endpoint:** `GET /api/tasks/calendar?from=2026-10-01&to=2026-10-31&projectId=uuid`
* Trả về **toàn bộ** task (không phân trang) có `startDate` hoặc `deadline` nằm trong khoảng, hoặc kéo dài qua cả khoảng. Khoảng tối đa 100 ngày. `projectId=none` cho Inbox.

### 5.4 Chi tiết task (mở trang)
* **Endpoint:** `GET /api/tasks/:id`
* **Phản hồi:** Task card + `content`, `project` (`id`, `name`, `icon`, `color`), `column`, `children` (mảng task card của task con).

### 5.5 Cập nhật task
* **Endpoint:** `PATCH /api/tasks/:id`
* **Payload:** `title`, `description`, `content`, `icon`, `priority`, `status`, `startDate`, `deadline` (gửi `null` để xóa ngày), `tagIds` (thay thế toàn bộ tag).
* Đổi project / cột / task cha / vị trí ⇒ dùng API move (5.6).

### 5.6 Kéo-thả (move)
* **Endpoint:** `POST /api/tasks/:id/move`
* **Payload (mọi field đều tùy chọn):**
```json
{
  "projectId": "uuid | null",
  "columnId": "uuid",
  "parentId": "uuid | null",
  "prevId": "uuid",
  "nextId": "uuid"
}
```

| Tình huống | Payload |
|---|---|
| Đổi thứ tự trong cùng cột | `{ "prevId": "A", "nextId": "B" }` |
| Kéo sang cột khác, thả giữa A và B | `{ "columnId": "col", "prevId": "A", "nextId": "B" }` |
| Thả lên đầu cột | `{ "columnId": "col", "nextId": "<task đầu tiên>" }` |
| Thả vào cột trống / cuối cột | `{ "columnId": "col" }` |
| Chuyển sang project khác | `{ "projectId": "p2" }` (vào cột khớp status hiện tại) |
| Đưa về Inbox | `{ "projectId": null }` |
| Biến thành task con | `{ "parentId": "parent" }` |
| Tách thành task độc lập | `{ "parentId": null }` |

* `prevId` / `nextId` phải thuộc danh sách đích, nếu không trả `400`.
* Không thể đặt task làm con của chính nó hoặc của hậu duệ của nó (`400`).
* Khi đổi project, task con đi theo và vào cột khớp status của chúng; nếu không gửi `parentId`, task tự tách khỏi task cha.
* **Phản hồi:** Chi tiết task như 5.4.

### 5.7 Xóa task
* **Endpoint:** `DELETE /api/tasks/:id` — xóa mềm task và toàn bộ task con.

---

## 6. Subtask (checklist)

| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/tasks/:taskId/subtasks` | `{ "title": "...", "deadline": "..." }` (thêm vào cuối) |
| PATCH | `/api/tasks/:taskId/subtasks/reorder` | `{ "ids": [...] }` — phản hồi danh sách đã sắp xếp |
| PATCH | `/api/tasks/:taskId/subtasks/:subtaskId` | `title`, `isCompleted`, `deadline` |
| DELETE | `/api/tasks/:taskId/subtasks/:subtaskId` | |

---

## 7. Bình luận

| Method | Endpoint | Body |
|---|---|---|
| GET | `/api/tasks/:taskId/comments` | — (cũ → mới) |
| POST | `/api/tasks/:taskId/comments` | `{ "content": "..." }` |
| PATCH | `/api/tasks/:taskId/comments/:commentId` | `{ "content": "..." }` |
| DELETE | `/api/tasks/:taskId/comments/:commentId` | |

---

## 8. Tag (`/api/task-tags`)

| Method | Endpoint | Body |
|---|---|---|
| GET | `/api/task-tags` | — mỗi tag có thêm `taskCount` |
| POST | `/api/task-tags` | `{ "name": "bug", "color": "#EF4444" }` — trùng tên trả `409 CONFLICT` |
| PATCH | `/api/task-tags/:id` | `name`, `color` |
| DELETE | `/api/task-tags/:id` | Gỡ tag khỏi mọi task |

Gán tag cho task qua `tagIds` khi tạo / cập nhật task.
