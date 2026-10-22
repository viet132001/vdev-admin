# VDEV Personal Finance Module API Integration Guide

Tài liệu này cung cấp chi tiết đặc tả API của **Finance Module** phục vụ cho Web Admin và App Client tích hợp các tính năng quản lý tài chính cá nhân.

---

## 1. Thông tin Chung

* **Base URL:** `/api/finance`
* **Xác thực:** Yêu cầu đính kèm Header `Authorization: Bearer <JWT_TOKEN>` cho tất cả các API.
* **Quy tắc xóa:** Sử dụng cơ chế xóa mềm (Soft Delete) đối với `Wallet`, `Transaction` và `Liability`.
* **Định dạng phản hồi:** Mọi phản hồi thành công được bọc dạng `{ "success": true, "data": <payload>, "message": "Success" }`. Các ví dụ phản hồi bên dưới chỉ mô tả phần `data`.
* **Định dạng lỗi:** `{ "success": false, "message": "...", "errorCode": "NOT_FOUND | BAD_REQUEST | ...", "errors": [] }` — khi lỗi validation, `message = "Validation failed"` và `errors` là mảng thông báo từng field.

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

---


## 6. API Nghĩa vụ tài chính (Liabilities) — Khoản vay & Thẻ tín dụng

Quản lý các khoản phải trả với ngân hàng/tổ chức: khoản vay trả góp và thẻ tín dụng (dư nợ, hạn mức, phí đáo thẻ), lịch sử thanh toán và ghi chú (có thể kèm thông tin bí mật như mật khẩu được mã hoá).

* **Base URL:** `/api/finance/liabilities`
* **Lưu ý số tiền:** Tất cả field tiền (`outstandingBalance`, `creditLimit`, `amount`...) trả về dạng **number** (VND), không phải string.
* **Ngày tháng:** ISO 8601. Với `summary.nextDueDate` FE chỉ hiển thị **phần ngày** theo giờ Việt Nam (không hiển thị giờ).

### 6.1 Enums

| Enum | Giá trị | Ý nghĩa |
|---|---|---|
| `LiabilityType` | `LOAN` | Khoản vay trả góp |
| | `CREDIT_CARD` | Thẻ tín dụng |
| `LiabilityStatus` | `ACTIVE` | Đang còn nghĩa vụ |
| | `PAID_OFF` | Đã tất toán (tự động khi khoản vay trả hết kỳ / hết dư nợ) |
| | `CLOSED` | Đã đóng (người dùng tự đặt, vd huỷ thẻ) |
| `LiabilityPaymentType` | `INSTALLMENT` | Góp kỳ — trừ dư nợ; với `LOAN` tăng `paidInstallments` +1 |
| | `PREPAYMENT` | Trả trước / trả bớt gốc — trừ dư nợ, không tăng số kỳ |
| | `INTEREST` | Trả lãi — **không** trừ dư nợ |
| | `FEE` | Phí (vd phí đáo thẻ) — **không** trừ dư nợ |

### 6.2 Kiểu dữ liệu (TypeScript gợi ý cho FE)

```ts
type LiabilityType = 'LOAN' | 'CREDIT_CARD';
type LiabilityStatus = 'ACTIVE' | 'PAID_OFF' | 'CLOSED';
type LiabilityPaymentType = 'INSTALLMENT' | 'PREPAYMENT' | 'INTEREST' | 'FEE';

interface LiabilitySummary {
  nextDueDate: string;            // Kỳ đến hạn tiếp theo (ISO)
  daysUntilDue: number;           // Số ngày còn lại tới hạn (0 = hôm nay)
  paidThisCycle: boolean;         // Đã thanh toán kỳ hiện tại sớm → nextDueDate đã nhảy sang tháng sau
  nextPaymentAmount: number;      // LOAN: số tiền góp kỳ tới | CREDIT_CARD: phí/lãi tháng ước tính
  estimatedMonthlyCharge: number; // outstandingBalance × monthlyRate / 100
  remainingInstallments: number | null; // LOAN: số kỳ còn lại
  progressPercent: number | null;       // LOAN: % kỳ đã góp
  availableCredit: number | null;       // CREDIT_CARD: hạn mức còn lại
  utilizationPercent: number | null;    // CREDIT_CARD: % hạn mức đã dùng
}

interface LiabilityPayment {
  id: string;
  liabilityId: string;
  type: LiabilityPaymentType;
  amount: number;          // Số tiền đã trả
  principalPart: number;   // Phần đã trừ vào dư nợ
  paidAt: string;
  note: string | null;
  walletId: string | null;
  transactionId: string | null; // Giao dịch chi tự tạo khi thanh toán từ ví
  createdAt: string;
}

interface LiabilityNote {
  id: string;
  liabilityId: string;
  title: string;
  content: string | null;
  hasSecret: boolean;      // true → hiển thị nút "Xem bí mật" (gọi API 6.13)
  remindAt: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Liability {
  id: string;
  ownerId: string;
  type: LiabilityType;
  status: LiabilityStatus;
  name: string;
  institutionName: string;          // Tên ngân hàng, vd "Cake Bank"
  currency: string;                 // Mặc định "VND"
  principalAmount: number | null;   // LOAN: số tiền vay gốc
  creditLimit: number | null;       // CREDIT_CARD: hạn mức
  outstandingBalance: number;       // Dư nợ hiện tại
  installmentAmount: number | null; // LOAN: tiền góp mỗi kỳ
  totalInstallments: number | null; // LOAN: tổng số kỳ
  paidInstallments: number;         // LOAN: số kỳ đã góp
  monthlyRate: number | null;       // % lãi/phí mỗi tháng, vd 1.7
  dueDay: number;                   // Ngày thanh toán hằng tháng (1-31)
  startDate: string | null;
  icon: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  payments: LiabilityPayment[];     // Danh sách: 5 thanh toán gần nhất | Chi tiết: toàn bộ
  notes: LiabilityNote[];           // Ghim trước, mới nhất trước
  summary: LiabilitySummary;        // Server tính sẵn, FE chỉ hiển thị
}
```

> **Quy tắc ngày đến hạn:** `dueDay` lớn hơn số ngày của tháng sẽ tự co về ngày cuối tháng (vd `dueDay = 30` → tháng 2 là ngày 28/29). Nếu người dùng đã thanh toán kỳ hiện tại sớm (LOAN: thanh toán `INSTALLMENT`; CREDIT_CARD: bất kỳ thanh toán nào), `nextDueDate` chuyển sang tháng sau và `paidThisCycle = true`.

### 6.3 Tạo nghĩa vụ mới
* **Endpoint:** `POST /api/finance/liabilities`
* **Payload (Body):**

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `type` | `LiabilityType` | ✅ | |
| `name` | string | ✅ | |
| `institutionName` | string | ✅ | |
| `dueDay` | int 1–31 | ✅ | |
| `principalAmount` | number ≥ 0 | ✅ nếu `LOAN` | |
| `creditLimit` | number ≥ 0 | ✅ nếu `CREDIT_CARD` | |
| `outstandingBalance` | number ≥ 0 | | `LOAN` bỏ trống → tự tính `principalAmount − installmentAmount × paidInstallments`; `CREDIT_CARD` bỏ trống → 0 |
| `installmentAmount` | number ≥ 0 | | LOAN |
| `totalInstallments` | int ≥ 1 | | LOAN |
| `paidInstallments` | int ≥ 0 | | LOAN, mặc định 0 (dùng khi nhập khoản vay đã góp được vài kỳ) |
| `monthlyRate` | number ≥ 0 | | % / tháng |
| `currency`, `startDate`, `icon`, `color` | | | Tùy chọn |

**Ví dụ — Khoản vay Cake Bank** (vay 10tr, góp 2tr5 ngày 15 hằng tháng, đã góp 3/4 kỳ):
```json
{
  "type": "LOAN",
  "name": "Vay tiêu dùng",
  "institutionName": "Cake Bank",
  "principalAmount": 10000000,
  "installmentAmount": 2500000,
  "totalInstallments": 4,
  "paidInstallments": 3,
  "dueDay": 15
}
```

**Ví dụ — Thẻ tín dụng Cake Bank** (hạn mức 30tr, dư nợ 25tr, phí đáo 1,7%/tháng, ngày 30):
```json
{
  "type": "CREDIT_CARD",
  "name": "Thẻ tín dụng",
  "institutionName": "Cake Bank",
  "creditLimit": 30000000,
  "outstandingBalance": 25000000,
  "monthlyRate": 1.7,
  "dueDay": 30
}
```

* **Phản hồi thành công (201 Created):** `Liability`. Ví dụ với khoản vay trên (tại ngày 2026-10-09):
```json
{
  "id": "a1b2c3d4-...",
  "type": "LOAN",
  "status": "ACTIVE",
  "name": "Vay tiêu dùng",
  "institutionName": "Cake Bank",
  "currency": "VND",
  "principalAmount": 10000000,
  "creditLimit": null,
  "outstandingBalance": 2500000,
  "installmentAmount": 2500000,
  "totalInstallments": 4,
  "paidInstallments": 3,
  "monthlyRate": null,
  "dueDay": 15,
  "payments": [],
  "notes": [],
  "summary": {
    "nextDueDate": "2026-10-15T00:00:00.000Z",
    "daysUntilDue": 6,
    "paidThisCycle": false,
    "nextPaymentAmount": 2500000,
    "estimatedMonthlyCharge": 0,
    "remainingInstallments": 1,
    "progressPercent": 75,
    "availableCredit": null,
    "utilizationPercent": null
  }
}
```
`summary` của thẻ tín dụng ở ví dụ trên:
```json
{
  "nextDueDate": "2026-10-30T00:00:00.000Z",
  "daysUntilDue": 21,
  "paidThisCycle": false,
  "nextPaymentAmount": 425000,
  "estimatedMonthlyCharge": 425000,
  "remainingInstallments": null,
  "progressPercent": null,
  "availableCredit": 5000000,
  "utilizationPercent": 83.33
}
```

### 6.4 Tổng quan (Dashboard)
* **Endpoint:** `GET /api/finance/liabilities/overview?days=30`
* **Query:** `days` (int, mặc định 30) — chỉ liệt kê các kỳ đến hạn trong N ngày tới.
* **Mô tả:** Chỉ tính các nghĩa vụ `ACTIVE`. `upcoming` sắp xếp theo hạn gần nhất — dùng cho widget "Sắp đến hạn".
* **Phản hồi thành công (200 OK):**
```json
{
  "totalOutstanding": 27500000,
  "totalLoanOutstanding": 2500000,
  "totalCreditLimit": 30000000,
  "totalCardOutstanding": 25000000,
  "totalAvailableCredit": 5000000,
  "estimatedMonthlyCharges": 425000,
  "upcoming": [
    {
      "id": "a1b2c3d4-...",
      "name": "Vay tiêu dùng",
      "institutionName": "Cake Bank",
      "type": "LOAN",
      "dueDate": "2026-10-15T00:00:00.000Z",
      "daysUntilDue": 6,
      "amount": 2500000
    },
    {
      "id": "e5f6a7b8-...",
      "name": "Thẻ tín dụng",
      "institutionName": "Cake Bank",
      "type": "CREDIT_CARD",
      "dueDate": "2026-10-30T00:00:00.000Z",
      "daysUntilDue": 21,
      "amount": 425000
    }
  ]
}
```

### 6.5 Danh sách nghĩa vụ
* **Endpoint:** `GET /api/finance/liabilities`
* **Query Parameters (Tùy chọn):** `type` (`LiabilityType`), `status` (`LiabilityStatus`). Giá trị enum sai → `400`.
* **Phản hồi thành công (200 OK):** `Liability[]` (mới tạo trước), mỗi phần tử kèm 5 thanh toán gần nhất, toàn bộ ghi chú và `summary`.

### 6.6 Chi tiết nghĩa vụ
* **Endpoint:** `GET /api/finance/liabilities/:id`
* **Phản hồi thành công (200 OK):** `Liability` kèm **toàn bộ** lịch sử thanh toán.

### 6.7 Cập nhật nghĩa vụ
* **Endpoint:** `PATCH /api/finance/liabilities/:id`
* **Payload:** Mọi field của 6.3 (trừ `type` — không đổi được loại) đều tùy chọn, thêm `status` (`LiabilityStatus`).
* **Mô tả:** Dùng để chỉnh dư nợ thẻ khi có chi tiêu mới (vd quẹt thêm → tăng `outstandingBalance`), đổi ngày thanh toán, hoặc đóng thẻ (`"status": "CLOSED"`).
```json
{ "outstandingBalance": 26500000 }
```
* **Phản hồi thành công (200 OK):** `Liability`.

### 6.8 Xóa nghĩa vụ (Xóa mềm)
* **Endpoint:** `DELETE /api/finance/liabilities/:id`
* **Phản hồi:** `{ "message": "Liability soft deleted successfully" }`

### 6.9 Ghi nhận thanh toán
* **Endpoint:** `POST /api/finance/liabilities/:id/payments`
* **Điều kiện:** Nghĩa vụ phải đang `ACTIVE`, nếu không → `400 Liability is not active`.
* **Payload (Body):**

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `type` | `LiabilityPaymentType` | ✅ | |
| `amount` | number > 0 | ✅ | Số tiền đã trả |
| `principalPart` | number ≥ 0 | | Phần trừ dư nợ. Mặc định = `amount` với `INSTALLMENT`/`PREPAYMENT`; luôn = 0 với `INTEREST`/`FEE`. Không vượt quá dư nợ |
| `paidAt` | ISO date | | Mặc định thời điểm hiện tại |
| `note` | string | | |
| `walletId` | UUID | | Nếu có: tự tạo **giao dịch chi** trong ví và trừ số dư ví |
| `categoryId` | UUID | ✅ nếu có `walletId` | Danh mục chi cho giao dịch tự tạo |

**Ví dụ — Góp kỳ cuối khoản vay, trừ tiền từ ví** (sau khi gọi: `paidInstallments` = 4, `outstandingBalance` = 0, `status` → `PAID_OFF`):
```json
{
  "type": "INSTALLMENT",
  "amount": 2500000,
  "paidAt": "2026-10-15T00:00:00.000Z",
  "walletId": "123e4567-e89b-12d3-a456-426614174000",
  "categoryId": "f39b6b8b-e85d-4f38-89c0-fb3663a8e9d3"
}
```

**Ví dụ — Trả phí đáo thẻ 1,7%** (dư nợ thẻ giữ nguyên):
```json
{ "type": "FEE", "amount": 425000, "note": "Phí đáo tháng 10" }
```

**Ví dụ — Trả bớt nợ thẻ 5tr:**
```json
{ "type": "PREPAYMENT", "amount": 5000000 }
```

* **Phản hồi thành công (201 Created):** `LiabilityPayment`. FE nên gọi lại 6.6 (hoặc 6.4/6.5) để cập nhật dư nợ và `summary`.

### 6.10 Lịch sử thanh toán
* **Endpoint:** `GET /api/finance/liabilities/:id/payments`
* **Phản hồi thành công (200 OK):** `LiabilityPayment[]` mới nhất trước, mỗi phần tử kèm `wallet` (object ví hoặc `null`).

### 6.11 Xóa thanh toán (nhập nhầm)
* **Endpoint:** `DELETE /api/finance/liabilities/:id/payments/:paymentId`
* **Mô tả:** Xóa hẳn bản ghi và hoàn tác: cộng lại `principalPart` vào dư nợ, giảm `paidInstallments` (nếu là kỳ góp của khoản vay), chuyển `PAID_OFF` → `ACTIVE`, xóa mềm giao dịch chi liên kết và hoàn tiền vào ví.
* **Phản hồi:** `{ "message": "Payment deleted successfully" }`

### 6.12 Ghi chú (Notes)

| Hành động | Endpoint |
|---|---|
| Tạo | `POST /api/finance/liabilities/:id/notes` |
| Danh sách | `GET /api/finance/liabilities/:id/notes` (ghim trước, mới nhất trước) |
| Cập nhật | `PATCH /api/finance/liabilities/:id/notes/:noteId` |
| Xóa | `DELETE /api/finance/liabilities/:id/notes/:noteId` |

* **Payload tạo (Body):**

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `title` | string | ✅ | |
| `content` | string | | Nội dung thường (không mã hoá) |
| `secret` | string | | Mật khẩu / PIN... — được **mã hoá** khi lưu, không bao giờ trả về trong các API thường |
| `remindAt` | ISO date | | Thời điểm nhắc |
| `isPinned` | boolean | | Mặc định `false` |

```json
{
  "title": "Cần thanh toán sớm trước tháng 12",
  "content": "Tất toán sớm để tránh phí",
  "secret": "123456",
  "remindAt": "2026-11-30T00:00:00.000Z",
  "isPinned": true
}
```
* **Phản hồi (201 Created):** `LiabilityNote` — chỉ có `hasSecret: true`, **không** có giá trị bí mật.
* **Cập nhật:** mọi field đều tùy chọn. Với `secret`: bỏ qua field → giữ nguyên; gửi chuỗi mới → thay thế; gửi `""` → xóa bí mật (`hasSecret` → `false`).
* **Xóa:** `{ "message": "Note deleted successfully" }` (xóa hẳn).

### 6.13 Xem bí mật của ghi chú
* **Endpoint:** `GET /api/finance/liabilities/:id/notes/:noteId/secret`
* **Mô tả:** Giải mã và trả về bí mật. Mỗi lần gọi được ghi audit log (`REVEAL_LIABILITY_SECRET`). Ghi chú không có bí mật → `404 Note has no secret`.
* **Phản hồi thành công (200 OK):**
```json
{ "secret": "123456" }
```
* **Gợi ý UI:** Mặc định hiển thị `••••••`, chỉ gọi API khi người dùng bấm "Hiện"; không lưu giá trị vào localStorage / state toàn cục, tự ẩn lại sau vài giây.

### 6.14 Lỗi thường gặp

| HTTP | `message` | Nguyên nhân |
|---|---|---|
| 400 | `principalAmount is required for LOAN` | Tạo/cập nhật khoản vay thiếu số tiền gốc |
| 400 | `creditLimit is required for CREDIT_CARD` | Tạo/cập nhật thẻ thiếu hạn mức |
| 400 | `Liability is not active` | Ghi thanh toán vào khoản đã `PAID_OFF`/`CLOSED` |
| 400 | `categoryId is required when walletId is set` | Thanh toán từ ví nhưng không chọn danh mục |
| 400 | `Wallet not found` / `Category not found` | Ví/danh mục không tồn tại hoặc không thuộc người dùng |
| 400 | `Validation failed` | Sai kiểu dữ liệu — xem mảng `errors` |
| 404 | `Liability not found` / `Payment not found` / `Note not found` | Không tồn tại, đã xóa, hoặc không thuộc người dùng |
| 404 | `Note has no secret` | Gọi 6.13 cho ghi chú không có bí mật |

### 6.15 Gợi ý màn hình

* **Dashboard nợ:** gọi 6.4 → thẻ tổng dư nợ, tổng hạn mức còn lại, phí/lãi dự kiến tháng này, danh sách "Sắp đến hạn" (tô đỏ khi `daysUntilDue <= 3`).
* **Danh sách:** gọi 6.5, chia tab theo `type`.
  * LOAN: thanh tiến độ `progressPercent`, "Còn `remainingInstallments` kỳ · `nextPaymentAmount` vào `nextDueDate`".
  * CREDIT_CARD: thanh `utilizationPercent`, "Còn trống `availableCredit` · Phí đáo `estimatedMonthlyCharge` ngày `nextDueDate`".
  * Badge "Đã thanh toán kỳ này" khi `paidThisCycle = true`.
* **Chi tiết:** gọi 6.6 → thông tin + lịch sử thanh toán + ghi chú (ghim lên đầu, icon 🔒 khi `hasSecret`).
* **Nút "Thanh toán":** form 6.9, điền sẵn `amount = summary.nextPaymentAmount`, `type` mặc định `INSTALLMENT` (LOAN) hoặc `FEE` (CREDIT_CARD); tùy chọn chọn ví + danh mục để trừ tiền ví.
