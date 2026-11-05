# VDEV Authentication Module API Integration Guide

Tài liệu này cung cấp chi tiết đặc tả API của **Authentication Module** để các lập trình viên Web Admin và App Client (iOS, Android, Web) tích hợp tính năng đăng ký, đăng nhập và phân quyền trước khi thực hiện các tính năng khác.

---

## 1. Đăng ký tài khoản (Register)

* **Endpoint:** `POST /api/auth/register`
* **Mô tả:** Đăng ký tài khoản người dùng mới.
* **Payload (Body):**
```json
{
  "email": "user@vdev.local",
  "password": "Password123",
  "fullName": "Nguyen Van A"
}
```
* **Phản hồi thành công (201 Created):**
```json
{
  "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
  "email": "user@vdev.local",
  "fullName": "Nguyen Van A",
  "status": "ACTIVE",
  "createdAt": "2026-07-20T14:20:00.000Z"
}
```

---

## 2. Đăng nhập hệ thống (Login)

* **Endpoint:** `POST /api/auth/login`
* **Mô tả:** Đăng nhập hệ thống bằng email và mật khẩu để lấy access token.
* **Payload (Body):**
```json
{
  "email": "user@vdev.local",
  "password": "Password123"
}
```
* **Phản hồi thành công (201 Created):**
```json
{
  "user": {
    "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
    "email": "user@vdev.local",
    "fullName": "Nguyen Van A",
    "avatarFileId": null,
    "roles": ["USER"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3YjJkNWEzZi0xZDg5LTRlNzgtYmEyZS0zZjg5MGFkNjdhMTIiLCJlbWFpbCI6InVzZXJAdmRldi5sb2NhbCIsImlhdCI6MTc4NTEyODAwMCwiZXhwIjoxNzg1MjE0NDAwfQ.xxxxxxx",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxxx"
}
```

* `accessToken` hết hạn sau **1 giờ**, `refreshToken` hết hạn sau **7 ngày**.

---

## 2.1. Làm mới token (Refresh)

* **Endpoint:** `POST /api/auth/refresh`
* **Mô tả:** Đổi `refreshToken` lấy cặp token mới khi `accessToken` hết hạn (API trả 401). `refreshToken` không dùng được làm Bearer token cho các API khác.
* **Payload (Body):**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxxx"
}
```
* **Phản hồi thành công (201 Created):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```
* **Lỗi (401):** refresh token sai/hết hạn → client xoá token và chuyển về màn đăng nhập.

---

## 3. Xem thông tin tài khoản hiện tại (Get Profile)

* **Endpoint:** `GET /api/auth/profile`
* **Mô tả:** Lấy thông tin chi tiết của người dùng đang đăng nhập dựa trên token.
* **Xác thực:** Yêu cầu đính kèm Header `Authorization: Bearer <JWT_TOKEN>`.
* **Phản hồi thành công (200 OK):**
```json
{
  "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
  "email": "user@vdev.local",
  "fullName": "Nguyen Van A",
  "avatarFileId": null,
  "phoneNumber": null,
  "status": "ACTIVE",
  "emailVerified": false,
  "lastLoginAt": "2026-07-20T14:21:00.000Z",
  "createdAt": "2026-07-20T14:20:00.000Z",
  "updatedAt": "2026-07-20T14:21:00.000Z",
  "deletedAt": null,
  "roles": ["USER"]
}
```

---

## 4. Cách thức sử dụng Token trong các API tiếp theo

Tất cả các API được bảo vệ bằng `JwtAuthGuard` (như Note, Learning, Finance) đều yêu cầu Client đính kèm Access Token vào Header:

* **Header Key:** `Authorization`
* **Header Value:** `Bearer <ACCESS_TOKEN>`

*Ví dụ cấu hình Header:*
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3YjJkNWEzZi0xZDg5LTR...
```

---

## 5. Đăng nhập bằng Google

Luồng redirect toàn trang, BE không có session:

1. FE sinh `state` ngẫu nhiên, lưu `sessionStorage`, chuyển trình duyệt tới `GET /api/auth/google?state=<state>`.
2. BE redirect sang Google; Google gọi lại `GET /api/auth/google/callback`.
3. BE redirect về FE:
   * Thành công: `{FRONTEND_URL}/auth/google/callback#accessToken=...&refreshToken=...&state=<state>`
   * Thất bại (từ chối, lỗi Google, email chưa xác minh): `{FRONTEND_URL}/login?oauth_error=google`
4. FE đối chiếu `state` với giá trị đã lưu, không khớp thì từ chối. Khớp thì lưu token, xoá fragment khỏi URL và gọi `GET /api/auth/profile`.

* Token nằm trong fragment để không bị gửi tới server nào; `state` chống login CSRF.
* Tài khoản mới nhận role `USER`. Email đã tồn tại thì liên kết Google vào tài khoản đó.
* Biến môi trường BE: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL` (gồm base path, vd. `https://viet132001.github.io/vdev-admin`).

---

## 6. Vai trò (Role)

* Hai role: `ADMIN`, `USER`. Mọi tài khoản có ít nhất `USER`; một user có thể có nhiều role.
* `POST /api/auth/login` (`user.roles`) và `GET /api/auth/profile` (`roles`) trả mảng mã role, ví dụ `["USER"]`.
* Role đọc từ DB ở mỗi request nên thu hồi có hiệu lực ngay, không cần đăng nhập lại.
* **Admin đầu tiên:** đặt `ADMIN_EMAILS=a@x.dev,b@x.dev` ở BE; email trong danh sách nhận `ADMIN` khi đăng nhập bằng **Google** (đăng nhập bằng mật khẩu không được cấp vì email chưa xác minh).

Các API dưới đây yêu cầu role `ADMIN`, thiếu quyền trả **403**.

### `GET /api/users?search=&page=1&limit=20`

`limit` tối đa 100; `search` tìm theo email hoặc họ tên, không phân biệt hoa thường. `lastLoginAt` là lần đăng nhập gần nhất bằng mật khẩu hoặc Google (làm mới token không tính), `null` nếu chưa có.

```json
{
  "data": [
    {
      "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
      "email": "user@vdev.local",
      "fullName": "Nguyen Van A",
      "avatarFileId": null,
      "status": "ACTIVE",
      "lastLoginAt": "2026-07-21T08:00:00.000Z",
      "createdAt": "2026-07-20T14:20:00.000Z",
      "roles": ["USER"],
      "providers": ["GOOGLE"]
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

### `GET /api/users/roles`

```json
[{ "code": "ADMIN", "name": "Administrator", "description": "..." }]
```

### `PATCH /api/users/:id/roles`

Đặt lại **toàn bộ** role của user, trả về user như một phần tử của danh sách trên.

```json
{ "roles": ["USER", "ADMIN"] }
```

* **400:** `roles` rỗng, role không tồn tại, hoặc gỡ `ADMIN` của admin cuối cùng (`Cannot remove the last admin`).
* **404:** không tìm thấy user.
