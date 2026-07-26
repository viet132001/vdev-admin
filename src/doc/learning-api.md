# VDEV Learning Module API Integration Guide

Tài liệu này cung cấp chi tiết đặc tả API của **Learning Module** phục vụ cho Web Admin và App Client tích hợp các tính năng quản lý khóa học và tiến độ học tập.

---

## 1. Thông tin Chung

* **Base URL:** `/api/learning`
* **Xác thực:** Yêu cầu đính kèm Header `Authorization: Bearer <JWT_TOKEN>` cho tất cả các API.
* **Quy tắc xóa:** Sử dụng cơ chế xóa mềm (Soft Delete) đối với `Course` và `Lesson`.

---

## 2. API Khóa học (Courses)

### 2.1 Tạo khóa học mới
* **Endpoint:** `POST /api/learning/courses`
* **Payload (Body):**
```json
{
  "title": "Tiếng Anh Giao Tiếp Cơ Bản",
  "description": "Lộ trình học tiếng Anh từ con số 0",
  "coverFileId": "123e4567-e89b-12d3-a456-426614174000",
  "difficulty": "BEGINNER",
  "language": "vi",
  "estimatedMinutes": 180,
  "isPublished": false
}
```

### 2.2 Lấy danh sách khóa học
* **Endpoint:** `GET /api/learning/courses`
* **Query Parameters (Tùy chọn):**
  - `isPublished` (Boolean): Lọc theo trạng thái xuất bản (`true` hoặc `false`).
* **Phản hồi thành công (200 OK):** Trả về mảng danh sách khóa học.

### 2.3 Xem chi tiết một khóa học
* **Endpoint:** `GET /api/learning/courses/:id`
* **Mô tả:** Trả về toàn bộ chi tiết khóa học bao gồm các Section và Lesson tương ứng bên trong.

### 2.4 Cập nhật khóa học
* **Endpoint:** `PATCH /api/learning/courses/:id`
* **Payload (Body):** Toàn bộ các trường trong `CreateCourseDto` đều là tùy chọn.

### 2.5 Xóa khóa học (Xóa mềm)
* **Endpoint:** `DELETE /api/learning/courses/:id`

### 2.6 Xem tiến trình học tập của khóa học
* **Endpoint:** `GET /api/learning/courses/:id/progress`
* **Phản hồi thành công (200 OK):**
```json
{
  "totalLessons": 5,
  "completedLessons": 2,
  "progressPercent": 40,
  "lessons": [
    {
      "lessonId": "b1a23c4d-...",
      "title": "Bài 1: Giới thiệu bản thân",
      "progressPercent": 100,
      "isCompleted": true,
      "completedAt": "2026-07-20T14:00:00.000Z"
    },
    {
      "lessonId": "d5e6f7g8-...",
      "title": "Bài 2: Giao tiếp công việc",
      "progressPercent": 50,
      "isCompleted": false,
      "completedAt": null
    }
  ]
}
```

---

## 3. API Chương học (Sections)

### 3.1 Tạo chương mới trong khóa học
* **Endpoint:** `POST /api/learning/courses/:courseId/sections`
* **Payload (Body):**
```json
{
  "title": "Chương 1: Khởi động",
  "description": "Các bài học nhập môn",
  "orderIndex": 1
}
```

### 3.2 Cập nhật chương học
* **Endpoint:** `PATCH /api/learning/sections/:sectionId`

### 3.3 Xóa chương học
* **Endpoint:** `DELETE /api/learning/sections/:sectionId`

---

## 4. API Bài học (Lessons)

### 4.1 Tạo bài học mới trong chương
* **Endpoint:** `POST /api/learning/sections/:sectionId/lessons`
* **Payload (Body):**
```json
{
  "title": "Bài 1: Bắt đầu",
  "summary": "Tóm tắt bài 1",
  "content": "Nội dung bài học dạng văn bản hoặc markdown...",
  "durationSeconds": 300,
  "orderIndex": 1
}
```

### 4.2 Xem chi tiết bài học (Kèm tài nguyên Asset)
* **Endpoint:** `GET /api/learning/lessons/:id`

### 4.3 Cập nhật/Xóa bài học
* **Endpoint:** `PATCH /api/learning/lessons/:id`
* **Endpoint:** `DELETE /api/learning/lessons/:id` (Xóa mềm)

---

## 5. API Tài nguyên bài học (Assets) & Tải lên MP3 (Audio)

Hệ thống hỗ trợ đính kèm các tài nguyên file như âm thanh (MP3), video, PDF vào bài học.

### 5.1 Quy trình tải lên và phát nhạc/audio MP3 của bài học:
1. **Bước 1: Tải file lên Storage**
   - **Endpoint:** `POST /api/storage/upload`
   - **Format:** `multipart/form-data` (trường `file`)
   - **Phản hồi:** Trả về đối tượng File có chứa `id` (ví dụ: `fileId`).
2. **Bước 2: Đính kèm file vào bài học**
   - **Endpoint:** `POST /api/learning/lessons/:id/assets`
   - **Payload (Body):**
     ```json
     {
       "fileId": "uuid-cua-file-mp3",
       "assetType": "AUDIO",
       "orderIndex": 1
     }
     ```
3. **Bước 3: Phát nhạc/Stream Audio**
   - Trình duyệt/Client phát file audio bằng cách gọi trực tiếp URL tải file của server:
     `GET /api/storage/files/:fileId/download` (Endpoint này không yêu cầu token xác thực để thẻ `<audio>` có thể load trực tiếp).

---

### 5.2 Đính kèm tài nguyên tổng quát
* **Endpoint:** `POST /api/learning/lessons/:id/assets`
* **Mô tả:** Đính kèm file đã có trên Storage làm tài nguyên học (ví dụ: PDF, AUDIO, VIDEO, IMAGE, DOCUMENT, ZIP, LINK).
* **Payload (Body):**
```json
{
  "fileId": "123e4567-e89b-12d3-a456-426614174000",
  "assetType": "AUDIO",
  "orderIndex": 1
}
```

### 5.3 Gỡ bỏ tài nguyên
* **Endpoint:** `DELETE /api/learning/lessons/assets/:assetId`

---

## 6. API Tiến độ bài học (Progress)

### 6.1 Cập nhật tiến độ của bài học
* **Endpoint:** `POST /api/learning/lessons/:id/progress`
* **Mô tả:** Học viên cập nhật tiến độ xem/đọc bài học. Hệ thống tự động đánh dấu hoàn thành bài học khi `progressPercent` bằng 100.
* **Payload (Body):**
```json
{
  "progressPercent": 100
}
```
