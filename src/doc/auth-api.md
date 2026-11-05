

---

## 7. Chặn email và IP

Yêu cầu role `ADMIN`.

| Đối tượng | Khi bị chặn |
|---|---|
| Email | Không đăng ký hay đăng nhập được (cả Google). Phiên đang mở bị đăng xuất ở request tiếp theo (401), token runner bị thu hồi |
| IP | Mọi request từ IP đó nhận **403** `Access blocked` |

* **Google:** email bị chặn được redirect về `{FRONTEND_URL}/login?oauth_error=blocked`.
* **Chuẩn hoá email:** Gmail bỏ dấu chấm và phần sau `+`, nên `a.b+x@gmail.com` và `ab@gmail.com` là một.
* `GET /api/users` có thêm `lastLoginIp`, `emailBlockId`, `ipBlockId` (`null` nếu không bị chặn).

### `GET /api/access-blocks`

```json
[{ "id": "uuid", "type": "EMAIL", "value": "ab@gmail.com", "reason": "Spam", "createdAt": "2026-11-05T07:00:00.000Z" }]
```

### `POST /api/access-blocks`

```json
{ "type": "IP", "value": "8.8.8.8", "reason": "Spam" }
```

* **400:** email/IP sai định dạng, email của admin, IP nội bộ, IP đang gọi API, hoặc IP đăng nhập gần nhất của một admin.
* **409:** đã chặn rồi.

### `DELETE /api/access-blocks/:id`

Bỏ chặn. **404** nếu không tồn tại. Token runner đã thu hồi không được khôi phục.

### Lưu ý vận hành

* Danh sách chặn được giữ trong RAM của BE: sửa trực tiếp trong DB thì phải khởi động lại BE, và BE chỉ chạy đúng với một instance.
* Lấy IP thật cần nginx gửi `X-Forwarded-For` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
