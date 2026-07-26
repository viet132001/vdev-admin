# VDEV Notes Module API Integration Guide

Tài liệu này cung cấp chi tiết đặc tả API của **Notes Module** nhằm phục vụ việc tích hợp giao diện cho Web Admin và App Client (iOS, Android, Web).

---

## 1. Thông tin Chung

* **Base URL:** `/api/notes`
* **Xác thực:** Yêu cầu đính kèm Header `Authorization: Bearer <JWT_TOKEN>` cho tất cả các API.
* **Quy tắc xóa:** Toàn bộ ghi chú sử dụng cơ chế xóa mềm (Soft Delete). API sẽ chỉ trả về các bản ghi chưa bị xóa (`deletedAt: null`).

---

## 2. Danh sách API endpoints

### 2.1 Tạo ghi chú mới (Create Note)
* **Endpoint:** `POST /api/notes`
* **Mô tả:** Tạo một ghi chú cơ bản (có thể đính kèm nhãn).
* **Payload (Body):**
```json
{
  "title": "Học lập trình NestJS",
  "summary": "Tài liệu ghi chú tổng hợp buổi 1",
  "folderId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
  "coverFileId": "123e4567-e89b-12d3-a456-426614174000",
  "isPinned": false,
  "tags": ["nestjs", "backend"]
}
```
* **Phản hồi thành công (201 Created):**
```json
{
  "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
  "title": "Học lập trình NestJS",
  "summary": "Tài liệu ghi chú tổng hợp buổi 1",
  "folderId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
  "coverFileId": "123e4567-e89b-12d3-a456-426614174000",
  "isPinned": false,
  "createdAt": "2026-07-20T14:20:00.000Z",
  "updatedAt": "2026-07-20T14:20:00.000Z",
  "noteBlocks": [],
  "noteTags": [
    {
      "tag": {
        "id": "9a38f321-df10-449e-b98a-ea394bf3218c",
        "name": "nestjs"
      }
    },
    {
      "tag": {
        "id": "e9b21f3a-8b1e-4c31-923f-5d6a2f3a8bde",
        "name": "backend"
      }
    }
  ]
}
```

---

### 2.2 Lấy danh sách ghi chú (Get Notes)
* **Endpoint:** `GET /api/notes`
* **Query Parameters:**
  - `folderId` (Tùy chọn): Lọc theo thư mục.
* **Phản hồi thành công (200 OK):** Trả về mảng danh sách ghi chú (được ưu tiên xếp các ghi chú ghim `isPinned` lên trước, sau đó sắp xếp theo thời gian cập nhật mới nhất).

---

### 2.3 Tìm kiếm ghi chú (Search Notes)
* **Endpoint:** `GET /api/notes/search`
* **Query Parameters:**
  - `q` (Bắt buộc): Từ khóa tìm kiếm. Tìm kiếm không phân biệt hoa thường theo: Tiêu đề (`title`), Tóm tắt (`summary`), Nội dung bên trong các block (`content`), hoặc tên của Nhãn (`tag`).
* **Phản hồi thành công (200 OK):** Mảng danh sách ghi chú thỏa mãn điều kiện.

---

### 2.4 Xem chi tiết một ghi chú (Get Note Detail)
* **Endpoint:** `GET /api/notes/:id`
* **Phản hồi thành công (200 OK):** Trả về chi tiết ghi chú bao gồm toàn bộ các khối nội dung (`noteBlocks` sắp xếp theo thứ tự tăng dần của `orderIndex`) và nhãn (`noteTags`).

---

### 2.5 Cập nhật ghi chú (Update Note)
* **Endpoint:** `PATCH /api/notes/:id`
* **Payload (Body):** Toàn bộ các trường trong `CreateNoteDto` đều là tùy chọn (Optional).
* **Phản hồi thành công (200 OK):** Đối tượng ghi chú sau khi cập nhật thành công.

---

### 2.6 Xóa mềm ghi chú (Delete Note)
* **Endpoint:** `DELETE /api/notes/:id`
* **Phản hồi thành công (200 OK):**
```json
{
  "message": "Note soft deleted successfully"
}
```

---

## 3. Quản lý Khối Ghi chú (NoteBlocks)

Giao diện của Ghi chú được thiết kế theo dạng khối (Blocks). Người dùng có thể linh động thêm, sửa, xóa các khối này.

### 3.1 Các loại khối nội dung (`NoteBlockType`)
* `TEXT`: Văn bản thường.
* `MARKDOWN`: Khối Markdown.
* `CHECKLIST`: Danh sách công việc cần làm.
* `CODE`: Khối code.
* `QUOTE`: Trích dẫn.
* `IMAGE`: Khối ảnh (chứa URL hoặc ID tệp tin).
* `TABLE`: Dạng bảng.
* `DIVIDER`: Dòng kẻ phân tách.
* `EMBED`: Nội dung nhúng (Youtube, v.v.).

### 3.2 Thêm khối nội dung mới vào ghi chú
* **Endpoint:** `POST /api/notes/:id/blocks`
* **Payload (Body):**
```json
{
  "type": "TEXT",
  "content": "Đây là khối nội dung văn bản đầu tiên của tôi",
  "orderIndex": 1
}
```

### 3.3 Cập nhật khối nội dung
* **Endpoint:** `PATCH /api/notes/blocks/:blockId`
* **Payload (Body):** Có thể truyền `content` hoặc `orderIndex` (sử dụng khi kéo thả sắp xếp lại thứ tự các khối).

### 3.4 Xóa khối nội dung
* **Endpoint:** `DELETE /api/notes/blocks/:blockId`
