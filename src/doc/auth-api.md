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
    "avatarFileId": null
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3YjJkNWEzZi0xZDg5LTRlNzgtYmEyZS0zZjg5MGFkNjdhMTIiLCJlbWFpbCI6InVzZXJAdmRldi5sb2NhbCIsImlhdCI6MTc4NTEyODAwMCwiZXhwIjoxNzg1MjE0NDAwfQ.xxxxxxx"
}
```

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
  "deletedAt": null
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
