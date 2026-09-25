# zsign-pages

Máy chủ sinh **manifest plist** cho zSign, chạy miễn phí trên Cloudflare Workers.

Đây là toàn bộ phần máy chủ mà zSign cần. Nó **không nhận, không lưu, không thấy** file IPA của bạn.

---

## Nó làm gì

iOS chỉ chịu cài ứng dụng từ một tệp *manifest plist* tải qua **HTTPS**. Nhưng file IPA thì không cần lên mạng — zSign chạy sẵn một máy chủ HTTP ngay trong máy bạn ở `127.0.0.1`.

Vì vậy luồng cài là:

```
zSign ký xong
   │
   ├─ bật máy chủ cục bộ trong máy, cổng ngẫu nhiên 4000–8000
   │
   ├─ gọi  https://<máy-chủ>/plist?bundleid=…&fetchurl=http://127.0.0.1:<cổng>/app.ipa
   │       └── máy chủ này trả về một tệp XML
   │
   └─ mở  itms-services://?action=download-manifest&url=<link ở trên>
           │
           └─ installd của iOS đọc XML, thấy fetchurl trỏ về 127.0.0.1
              → quay vào lấy IPA từ chính máy bạn
```

Máy chủ chỉ biến mấy tham số trên URL thành XML. **File IPA đi thẳng từ ổ đĩa vào installd.**

---

### 1. Tạo Worker trên Cloudflare

1. Vào [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Chọn thẻ **Workers** → **Import a repository** (hoặc **Connect to Git**)
3. Cho phép Cloudflare truy cập GitHub, chọn kho vừa fork
4. Phần build để trống hết:

   | Ô | Điền |
   |---|---|
   | Build command | *(để trống)* |
   | Deploy command | `npx wrangler deploy` |
   | Root directory | `/` |

5. Bấm **Deploy**

Xong, bạn có địa chỉ dạng `zsign-pages.<tên-bạn>.workers.dev`.

### 2. Thử xem chạy chưa

Mở trên trình duyệt:

```
https://<địa-chỉ-của-bạn>/plist?bundleid=com.test&name=Test&version=1.0&fetchurl=http://127.0.0.1:1/app.ipa
```

Ra một đoạn XML bắt đầu bằng `<?xml version="1.0"` là đúng.

### 3. Gắn tên miền riêng (không bắt buộc)

Trong Worker vừa tạo → **Settings** → **Domains & Routes** → **Add** → **Custom domain**.

Tên miền phải đang dùng Cloudflare làm DNS. Nếu đã có bản ghi A/CNAME trùng tên thì xoá bản ghi cũ đi, Cloudflare sẽ tự tạo bản ghi mới trỏ về Worker.

### 4. Chỉ zSign sang máy chủ của bạn

Trong app: **Cài đặt → Máy chủ plist → Thêm máy chủ**, dán tên miền vào (chỉ tên miền, không cần `https://` hay `/plist`).

Bấm **Kiểm tra máy chủ này** để xác nhận trước khi dùng.

---

## Đặc tả `/plist`

`GET /plist` — phương thức khác trả về `405`.

| Tham số | Bắt buộc | Ý nghĩa |
|---|---|---|
| `bundleid` | ✅ | Bundle identifier của app |
| `name` | ✅ | Tên hiển thị lúc cài |
| `fetchurl` | ✅ | Nơi lấy IPA — zSign luôn truyền `http://127.0.0.1:<cổng>/app.ipa` |
| `version` | | Số phiên bản |
| `smallimage` | | Icon 57×57 |
| `largeimage` | | Icon 512×512 |
| `t` | | Dấu thời gian Unix, dùng để hết hạn link |

**Mã trả về**

| Mã | Khi nào |
|---|---|
| `200` | XML manifest, `Content-Type: text/xml; charset=utf-8` |
| `400` | Thiếu `bundleid`, `name` hoặc `fetchurl` |
| `403` | `t` lệch quá 15 phút so với giờ máy chủ |
| `405` | Không phải GET |

Mọi giá trị đều được escape `< > & ' "` trước khi nhét vào XML.

---

## Chống lạm dụng

Đường dẫn `/plist` là công khai, ai có link cũng gọi được. Hai lớp bảo vệ:

**1. Link tự hết hạn.** Tham số `t` khiến link chỉ sống 15 phút. Sửa ở `worker.js`:

```js
if (t && Math.abs(Date.now() / 1000 - t) > 900) {   // 900 giây
```

**2. Rate limiting ở edge** — quan trọng hơn, vì nó chặn **trước khi** Worker chạy nên không tốn hạn mức.

Trong Cloudflare: **Security** → **WAF** → **Rate limiting rules** → **Create rule**

| Ô | Giá trị |
|---|---|
| Field | `URI Path` |
| Operator | `equals` |
| Value | `/plist` |
| Rate | 10 requests / 10 seconds |
| Counting characteristic | `IP` |
| Action | `Block` |

> Gói miễn phí cho **1 rule**, tính theo IP, chu kỳ ngắn nhất 10 giây. Vậy là đủ.
