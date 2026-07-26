# VDEV Personal Finance Module API Integration Guide

Tài liệu này cung cấp chi tiết đặc tả API của **Finance Module** phục vụ cho Web Admin và App Client tích hợp các tính năng quản lý tài chính cá nhân.

---

## 1. Thông tin Chung

* **Base URL:** `/api/finance`
* **Xác thực:** Yêu cầu đính kèm Header `Authorization: Bearer <JWT_TOKEN>` cho tất cả các API.
* **Quy tắc xóa:** Sử dụng cơ chế xóa mềm (Soft Delete) đối với `Wallet` và `Transaction`.

---

## 2. API Ví tiền (Wallets)

### 2.1 Tạo ví mới
* **Endpoint:** `POST /api/finance/wallets`
* **Payload (Body):**
```json
{
  "name": "Tài khoản Techcombank",
  "type": "BANK",
  "currency": "VND",
  "initialBalance": 5000000,
  "icon": "bank",
  "color": "#1A73E8"
}
```

### 2.2 Lấy danh sách ví
* **Endpoint:** `GET /api/finance/wallets`
* **Phản hồi thành công (200 OK):** Trả về mảng danh sách ví kèm theo số dư hiện tại (`currentBalance`).

### 2.3 Cập nhật/Xóa ví
* **Endpoint:** `PATCH /api/finance/wallets/:id`
* **Endpoint:** `DELETE /api/finance/wallets/:id` (Xóa mềm ví)

---

## 3. API Danh mục thu chi (Categories)

### 3.1 Tạo danh mục mới
* **Endpoint:** `POST /api/finance/categories`
* **Payload (Body):**
```json
{
  "name": "Ăn trưa",
  "type": "EXPENSE",
  "parentId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3", // ID danh mục cha (tùy chọn)
  "icon": "lunch",
  "color": "#FF5722"
}
```

### 3.2 Lấy danh sách danh mục phân cấp
* **Endpoint:** `GET /api/finance/categories`
* **Phản hồi thành công (200 OK):** Trả về mảng danh mục kèm theo danh sách con (`children: []`) lồng nhau.

---

## 4. API Giao dịch tài chính (Transactions)

### 4.1 Tạo giao dịch mới
* **Endpoint:** `POST /api/finance/transactions`
* **Mô tả:** Tạo một giao dịch thu hoặc chi. Hệ thống sẽ tự động tăng/giảm số dư hiện tại (`currentBalance`) của Ví liên quan. Hóa đơn đính kèm được lưu qua `receiptFileId` của Storage.
* **Payload (Body):**
```json
{
  "walletId": "123e4567-e89b-12d3-a456-426614174000",
  "categoryId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
  "amount": 50000,
  "type": "EXPENSE",
  "title": "Mua giáo trình Tiếng Anh",
  "note": "Mua tại nhà sách Nguyễn Văn Cừ",
  "receiptFileId": "123e4567-e89b-12d3-a456-426614174999", // Tùy chọn (Storage File ID)
  "transactionDate": "2026-07-20T14:20:00.000Z" // Tùy chọn, mặc định hiện tại
}
```

### 4.2 Lấy danh sách giao dịch
* **Endpoint:** `GET /api/finance/transactions`
* **Query Parameters (Tùy chọn):**
  - `walletId` (UUID): Lọc theo ví.
  - `categoryId` (UUID): Lọc theo danh mục.
  - `startDate` (YYYY-MM-DD): Lọc theo ngày bắt đầu.
  - `endDate` (YYYY-MM-DD): Lọc theo ngày kết thúc.
  - `q` (String): Từ khóa tìm kiếm theo tiêu đề hoặc ghi chú.
* **Phản hồi thành công (200 OK):** Danh sách giao dịch sắp xếp theo thời gian mới nhất.

### 4.3 Cập nhật giao dịch
* **Endpoint:** `PATCH /api/finance/transactions/:id`
* **Mô tả:** Cập nhật thông tin giao dịch. Hệ thống sẽ tự động đảo ngược số tiền cũ trên ví cũ và áp dụng số tiền/ví mới.

### 4.4 Xóa giao dịch (Xóa mềm)
* **Endpoint:** `DELETE /api/finance/transactions/:id`
* **Mô tả:** Đánh dấu xóa giao dịch, đồng thời tự động hoàn trả/khấu trừ lại số tiền giao dịch đó vào số dư hiện tại của Ví liên quan.

---

## 5. API Ngân sách (Budgets)

### 5.1 Tạo hạn mức ngân sách mới
* **Endpoint:** `POST /api/finance/budgets`
* **Payload (Body):**
```json
{
  "name": "Ngân Sách Ăn Uống Tháng 7",
  "startDate": "2026-07-01T00:00:00.000Z",
  "endDate": "2026-07-31T23:59:59.000Z",
  "totalAmount": 5000000,
  "items": [
    {
      "categoryId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
      "amount": 3000000
    }
  ]
}
```

### 5.2 Xem chi tiết ngân sách và tiến trình sử dụng thực tế
* **Endpoint:** `GET /api/finance/budgets/:id`
* **Phản hồi thành công (200 OK):**
```json
{
  "id": "7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12",
  "name": "Ngân Sách Ăn Uống Tháng 7",
  "startDate": "2026-07-01T00:00:00.000Z",
  "endDate": "2026-07-31T23:59:59.000Z",
  "totalBudgetAmount": 5000000,
  "budgetItems": [
    {
      "id": "item-uuid-1",
      "categoryId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3",
      "categoryName": "Ăn uống",
      "budgetAmount": 3000000,
      "actualSpent": 1250000, // Tự động tổng hợp chi tiêu thực tế trong khoảng thời gian
      "remaining": 1750000 // Số tiền còn lại trong hạn mức
    }
  ]
}
```
