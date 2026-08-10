VDEV Notes Module API Integration Guide (Bổ sung Cập nhật Ghi chú & Quản lý Task)
Tài liệu này cung cấp chi tiết đặc tả API bổ sung của hai phân hệ Notes Module (Cập nhật ghi chú/Khối ghi chú) và Tasks Module (Quản lý Task & Subtask kèm Deadline) để tích hợp giao diện cho Web Admin và App Client.

1. PHÂN HỆ GHI CHÚ (NOTES & NOTEBLOCKS) - Cập nhật bổ sung
1.1 Cập nhật ghi chú (Update Note)
Endpoint: PATCH /api/notes/:id
Xác thực: Authorization: Bearer <JWT_TOKEN>
Payload (Body) mẫu: (Tất cả các trường đều là tùy chọn)
json

{
  "title": "Học NestJS nâng cao (Đã cập nhật)",
  "summary": "Tập trung vào phần Microservices và Cache",
  "folderId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
  "coverFileId": "123e4567-e89b-12d3-a456-426614174000",
  "isPinned": true,
  "tags": ["nestjs", "backend", "cache"]
}
Phản hồi thành công (200 OK):
json

{
  "success": true,
  "data": {
    "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
    "title": "Học NestJS nâng cao (Đã cập nhật)",
    "summary": "Tập trung vào phần Microservices và Cache",
    "folderId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
    "coverFileId": "123e4567-e89b-12d3-a456-426614174000",
    "isPinned": true,
    "createdAt": "2026-07-20T14:20:00.000Z",
    "updatedAt": "2026-07-28T10:30:00.000Z",
    "noteBlocks": [],
    "noteTags": [
      {
        "tag": { "id": "9a38f321-df10-449e-b98a-ea394bf3218c", "name": "nestjs" }
      }
    ]
  },
  "message": "Success"
}
1.2 Thêm Khối nội dung mới (Add NoteBlock)
Endpoint: POST /api/notes/:id/blocks
Payload (Body):
json

{
  "type": "TEXT", // Enums: TEXT, MARKDOWN, CHECKLIST, CODE, QUOTE, IMAGE, TABLE, DIVIDER, EMBED
  "content": "Đây là nội dung của một block văn bản mới.",
  "orderIndex": 1
}
Phản hồi thành công (201 Created): Trả về đối tượng NoteBlock vừa tạo.
1.3 Cập nhật Khối nội dung (Update NoteBlock)
Endpoint: PATCH /api/notes/blocks/:blockId
Payload (Body): (Tùy chọn truyền các trường)
json

{
  "content": "Nội dung block sau khi chỉnh sửa...",
  "orderIndex": 2
}
1.4 Xóa Khối nội dung (Delete NoteBlock)
Endpoint: DELETE /api/notes/blocks/:blockId
Phản hồi thành công (200 OK):
json

{
  "success": true,
  "data": {
    "message": "Note block deleted successfully"
  },
  "message": "Success"
}
2. PHÂN HỆ QUẢN LÝ TASK (TASKS & SUBTASKS)
Phân hệ Task hỗ trợ quản lý các đầu việc lớn (Tasks), các đầu việc con (Subtasks) và thời hạn hoàn thành (Deadline).

2.1 Tạo Task mới (Create Task)
Endpoint: POST /api/tasks
Xác thực: Authorization: Bearer <JWT_TOKEN>
Payload (Body):
json

{
  "title": "Hoàn thiện Backend API Phase 2",
  "description": "Viết tài liệu tích hợp và triển khai test e2e cho Task Module",
  "deadline": "2026-08-15T17:00:00.000Z", // Định dạng ISO 8601 (Tùy chọn)
  "subtasks": [ // Danh sách subtask đi kèm lúc tạo (Tùy chọn)
    {
      "title": "Viết schema database",
      "deadline": "2026-08-05T00:00:00.000Z"
    },
    {
      "title": "Triển khai module controller và service"
    }
  ]
}
Phản hồi thành công (201 Created):
json

{
  "success": true,
  "data": {
    "id": "e44c2117-91f8-4b77-8c43-22ea8d88fa7b",
    "ownerId": "a382c0c3-03ff-4629-8aa5-608afdda1fb9",
    "title": "Hoàn thiện Backend API Phase 2",
    "description": "Viết tài liệu tích hợp và triển khai test e2e cho Task Module",
    "status": "PENDING", // Mặc định khi tạo mới. Enums: PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    "deadline": "2026-08-15T17:00:00.000Z",
    "createdAt": "2026-07-28T10:35:00.000Z",
    "updatedAt": "2026-07-28T10:35:00.000Z",
    "deletedAt": null,
    "subtasks": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "taskId": "e44c2117-91f8-4b77-8c43-22ea8d88fa7b",
        "title": "Viết schema database",
        "isCompleted": false,
        "deadline": "2026-08-05T00:00:00.000Z",
        "createdAt": "2026-07-28T10:35:00.000Z",
        "updatedAt": "2026-07-28T10:35:00.000Z"
      }
    ]
  },
  "message": "Success"
}
2.2 Lấy danh sách Tasks (Get Tasks with Pagination & Filter)
Endpoint: GET /api/tasks
Query Parameters:
page (Tùy chọn, mặc định 1): Trang hiện tại.
limit (Tùy chọn, mặc định 20): Số lượng bản ghi mỗi trang.
keyword (Tùy chọn): Tìm kiếm theo từ khóa trong title hoặc description.
status (Tùy chọn): Lọc theo trạng thái (PENDING, IN_PROGRESS, COMPLETED, CANCELLED).
sort (Tùy chọn, mặc định createdAt): Sắp xếp theo trường.
order (Tùy chọn, mặc định desc): Thứ tự sắp xếp (asc, desc).
Phản hồi thành công (200 OK):
json

{
  "success": true,
  "data": {
    "data": [ ... ],
    "total": 12,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "message": "Success"
}
2.3 Xem chi tiết Task (Get Task Detail)
Endpoint: GET /api/tasks/:id
Phản hồi thành công (200 OK): Trả về đầy đủ thông tin Task và danh sách các Subtask sắp xếp theo createdAt tăng dần.
2.4 Cập nhật Task (Update Task)
Endpoint: PATCH /api/tasks/:id
Payload (Body): (Tùy chọn các trường)
json

{
  "title": "Tiêu đề mới",
  "description": "Mô tả mới",
  "status": "IN_PROGRESS", // PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  "deadline": "2026-08-20T12:00:00.000Z" // Gửi null để xóa deadline
}
2.5 Xóa Task (Delete Task)
Endpoint: DELETE /api/tasks/:id
Mô tả: Hệ thống sử dụng Xóa mềm (Soft Delete).
Phản hồi thành công (200 OK): Trả về { "success": true }.
2.6 Quản lý Subtasks
A. Thêm Subtask mới vào Task
Endpoint: POST /api/tasks/:taskId/subtasks
Payload (Body):
json

{
  "title": "Subtask mới bổ sung",
  "deadline": "2026-08-10T00:00:00.000Z" // Tùy chọn
}
B. Cập nhật Subtask
Endpoint: PATCH /api/tasks/:taskId/subtasks/:subtaskId
Payload (Body): (Tùy chọn)
json

{
  "title": "Tiêu đề subtask thay đổi",
  "isCompleted": true, // Đánh dấu hoàn thành
  "deadline": null // Xóa deadline
}
C. Xóa Subtask
Endpoint: DELETE /api/tasks/:taskId/subtasks/:subtaskId
Phản hồi thành công (200 OK): Trả về { "success": true }.