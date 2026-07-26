# VDEV Admin - Design Guideline & UI/UX Standards

Tài liệu này đóng vai trò là kim chỉ nam thiết kế giao diện (UI) và trải nghiệm người dùng (UX) cho hệ thống **VDEV Admin Portal**. Việc áp dụng nhất quán các tiêu chuẩn này giúp đảm bảo hệ thống luôn trực quan, chuyên nghiệp, thân thiện và dễ dàng mở rộng.

---

## 1. Thiết Kế Hệ Thống Tổng Thể (System Architecture & Principles)

### 1.1 Tính Nhất Quán (Consistency)
* **Quy tắc**: Toàn bộ hệ thống sử dụng chung một cấu trúc Layout, bộ token màu sắc, kích thước font chữ và các thành phần giao diện mẫu (Reusable Components).
* **Áp dụng**: Các biểu tượng cùng ý nghĩa (ví dụ: Xóa, Sửa, Thêm mới) hoặc các thông báo trạng thái (Đang tải, Hoàn thành, Lỗi) phải được hiển thị đồng bộ trên tất cả các trang.

### 1.2 Bố Cục Phân Cấp Trực Quan (Visual Hierarchy)
* Sử dụng kích thước chữ (Font Size), độ đậm (Font Weight) và độ tương phản màu sắc để hướng sự chú ý của người dùng vào thông tin quan trọng nhất.
* **Tiêu đề trang (Heading 1)** luôn có kích thước lớn và rõ nét ở phía trên cùng, tiếp sau đó là các thẻ điều hướng phụ và vùng nội dung chính.

---

## 2. Màu Sắc & Kiểu Chữ (Colors & Typography)

Hệ thống sử dụng bộ màu hiện đại dạng **HSL** để tự động thích ứng với cả chế độ Sáng (Light Mode) và Tối (Dark Mode).

### 2.1 Bảng Màu Hệ Thống (Color Palette)

| Loại Màu | Mô tả | HSL Light Mode | HSL Dark Mode | Giao diện áp dụng |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | Màu chủ đạo (Tím) | `hsl(265, 90%, 60%)` | `hsl(265, 90%, 60%)` | Nút chính, Active Tab, Icon quan trọng |
| **Primary Hover** | Màu di chuột | `hsl(265, 85%, 52%)` | `hsl(265, 85%, 52%)` | Trạng thái hover của nút chính |
| **Primary Light** | Màu nền nhạt | `hsl(265, 90%, 96%)` | `hsl(265, 30%, 18%)` | Nền Active Menu, nền Badge thông tin |
| **Success** | Thành công (Xanh lá) | `hsl(142, 72%, 45%)` | `hsl(142, 72%, 45%)` | Thu nhập, Hoàn thành, Badge Đang học |
| **Warning** | Cảnh báo (Vàng) | `hsl(38, 92%, 50%)` | `hsl(38, 92%, 50%)` | Trạng thái Chờ duyệt, Lưu ý quan trọng |
| **Danger** | Lỗi/Xóa (Đỏ) | `hsl(350, 89%, 60%)` | `hsl(350, 89%, 60%)` | Chi tiêu, Nút Xóa, Thông báo lỗi |
| **Background App**| Nền ứng dụng | `hsl(240, 15%, 98%)` | `hsl(240, 18%, 10%)` | Toàn bộ nền bao phủ màn hình |
| **Background Card**| Nền thẻ/bảng | `hsl(0, 0%, 100%)` | `hsl(240, 16%, 13%)` | Thẻ chức năng, dòng của Bảng |
| **Text Main** | Chữ nội dung | `hsl(240, 10%, 15%)` | `hsl(240, 10%, 92%)` | Tiêu đề, chữ hiển thị chính |
| **Text Muted** | Chữ mờ/phụ | `hsl(240, 8%, 46%)` | `hsl(240, 6%, 65%)` | Phụ đề, Placeholder, Giờ tạo |

### 2.2 Kiểu Chữ (Typography)
* **Font chữ chính**: `Plus Jakarta Sans`, fallback về `system-ui`, `-apple-system`, `sans-serif`.
* **Thông số tiêu biểu**:
  * **H1 (Tiêu đề trang)**: `1.75rem / 28px`, Bold (`700`), Letter-spacing `-0.02em`.
  * **H2 (Tiêu đề mục)**: `1.25rem / 20px`, Semi-bold (`600`).
  * **Body (Nội dung chính)**: `0.875rem / 14px`, Regular (`400`).
  * **Caption/Helper text**: `0.75rem / 12px`, Medium/Regular (`500` hoặc `400`), màu `var(--text-muted)`.

---

## 3. Quy Chuẩn Giao Diện Thiết Bị & Mobile Friendly

### 3.1 Responsive Layout (Tương Thích Mọi Thiết Bị)
* Giao diện tự động co giãn linh hoạt trên **Desktop**, **Tablet**, và **Mobile**.
* Tuyệt đối không để xảy ra hiện tượng tràn màn hình tạo thanh cuộn ngang (`overflow-x`) trên toàn trang.
* Cấu trúc Layout Flexbox và Grid được chia linh hoạt:
  * **Desktop**: Sidebar hiển thị cố định ở bên trái (`width: 260px`).
  * **Mobile/Tablet**: Sidebar chuyển thành dạng Drawer thu gọn hoặc trượt từ cạnh trái màn hình để tối ưu không gian hiển thị.

### 3.2 Mobile-First & Vùng Tương Tác
* Các nút bấm, liên kết và ô nhập liệu phải có vùng chạm tối thiểu là **`44px x 44px`** trên thiết bị di động để tránh nhấn nhầm.
* Menu điều hướng và các bộ lọc tìm kiếm được đưa vào các bảng điều khiển dạng bottom sheet hoặc modal tối ưu cho thao tác một ngón tay.
* **Chuyển đổi dữ liệu**: Các bảng dữ liệu lớn (nhiều cột) khi hiển thị trên màn hình Mobile phải tự động chuyển thành định dạng **dạng Thẻ (Card Grid)**, mỗi hàng của bảng thành một Card độc lập để dễ theo dõi và tương tác.

---

## 4. Các Module Tiêu Chuẩn & Thành Phần (UI Components)

### 4.1 Bộ Lọc & Bảng Dữ Liệu (Data Tables)
* **Header**: Phải được cố định vị trí (`position: sticky; top: 0`) khi người dùng cuộn xem danh sách dài.
* **Thao tác nhanh**: Các nút hành động (Xem, Sửa, Xóa) phải được xếp ở cột cuối cùng một cách đồng bộ. Sử dụng Tooltip và Icon rõ nghĩa.
* **Tính năng bắt buộc**:
  * **Tìm kiếm (Search)**: Có cơ chế **Debounce** (trì hoãn gửi API từ `300ms - 500ms`) để giảm tải lượng request thừa lên server.
  * **Bộ lọc (Filter)**: Lọc theo danh mục, khoảng thời gian.
  * **Phân trang (Pagination)**: Định vị rõ trang hiện tại, tổng số dòng và số dòng trên mỗi trang (Ví dụ: 10, 20, 50).

### 4.2 Biểu Mẫu Nhập Liệu (Form Controls)
* **Cấu trúc**: Nhãn nhập liệu (Label) luôn nằm phía trên ô nhập liệu (Input).
* **Định dạng**: Các trường bắt buộc nhập phải có dấu hoa thị màu đỏ (`*`).
* **Validation (Kiểm tra dữ liệu)**:
  * Kiểm tra lỗi tức thì (Inline Validation) khi người dùng di chuyển con trỏ ra ngoài ô nhập (onBlur) hoặc nhập sai định dạng (ví dụ: Email, Số điện thoại).
  * Hiển thị thông báo lỗi màu đỏ (`var(--danger)`) kèm viền ô nhập đổi màu đỏ để người dùng dễ nhận biết.

### 4.3 Phản Hồi Từ Hệ Thống (Feedback & States)
* **Trạng thái Đang tải (Loading State)**: Hiển thị Skeleton Loader hoặc biểu tượng Spinner xoay tròn mượt mà khi hệ thống đang gọi API lấy dữ liệu.
* **Trạng thái Không có dữ liệu (Empty State)**: Khi danh sách trống, hiển thị hình minh họa nhẹ nhàng kèm thông điệp giải thích rõ ràng và một nút hành động gợi ý (ví dụ: "Thêm ghi chú đầu tiên").
* **Thông báo Toast (Notification)**: Sử dụng các thông báo góc trên bên phải màn hình hiển thị kết quả thao tác trong vòng `3s` (Thành công - Xanh lá, Lỗi - Đỏ, Cảnh báo - Vàng).
* **Hộp thoại xác nhận (Confirm Dialog)**: Các thao tác nguy hiểm (ví dụ: Xóa dữ liệu, Đăng xuất) **bắt buộc** phải hiển thị Pop-up xác nhận trước khi thực hiện để tránh sai sót của người dùng.

---

## 5. Hiệu Năng, Bảo Mật & Khả Năng Mở Rộng

### 5.1 Hiệu năng (Performance)
* Sử dụng Lazy loading cho các component hoặc trang không dùng ngay.
* Tránh tính toán lại các dữ liệu phức tạp trong mỗi lần component render bằng cách sử dụng `useMemo` hoặc `useCallback`.

### 5.2 Phân Quyền & Bảo Mật Giao Diện (Security)
* Ẩn hoặc vô hiệu hóa hoàn toàn các nút hành động, menu điều hướng mà tài khoản người dùng hiện tại không có quyền truy cập (Role-based UI access control).
* Không hiển thị các trường dữ liệu nhạy cảm nếu không có token phân quyền hợp lệ.
