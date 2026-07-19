# Báo cáo cập nhật HSK, Tàng Thư Các và âm thanh

## Nội dung đã thực hiện

1. **Phân loại toàn bộ từ điển theo HSK**
   - Tổng số mục được xử lý: **12.430**.
   - Không còn mục chưa phân loại.
   - Nhóm hiển thị: HSK 1, 2, 3, 4, 5, 6 và HSK 7–9.
   - Mỗi mục có thêm `hsk_level`, `hsk_source`; các mục khớp chính thức có thêm `hsk_official_index`.

2. **Nguồn phân loại**
   - Dùng danh mục từ vựng và chữ Hán trong **HSK 3.0 Examination Syllabus 2026**.
   - Nguồn: https://hsk.cn-bj.ufileos.com/3.0/%E6%96%B0%E7%89%88HSK%E8%80%83%E8%AF%95%E5%A4%A7%E7%BA%B21219.pdf
   - Với từ cũ của project không khớp chính xác danh mục mới: giữ cấp HSK cũ 1–6.
   - Với chữ/từ ngoài danh mục và bắt buộc phải có cấp: đưa vào nhóm nâng cao HSK 7–9.

3. **Số lượng hiển thị trong Từ điển**

| Nhóm | Số mục |
|---|---:|
| HSK 1 | 294 |
| HSK 2 | 174 |
| HSK 3 | 431 |
| HSK 4 | 919 |
| HSK 5 | 1.357 |
| HSK 6 | 1.421 |
| HSK 7–9 | 7.834 |
| **Tổng** | **12.430** |

4. **Giao diện Từ điển**
   - Thêm bộ lọc HSK có số lượng tự động lấy từ dữ liệu.
   - Chọn một cấp sẽ mở danh sách từ của cấp đó, tải 48 mục mỗi lần.
   - Tìm kiếm và bộ lọc từ loại hoạt động trong cấp HSK đang chọn.
   - Cấp đang chọn được giữ trên URL bằng tham số `?hsk=`.

5. **Tàng Thư Các**
   - Khi chọn Từ điển, Ngữ pháp hoặc Thành ngữ, hai thẻ còn lại được ẩn.
   - Chỉ panel đang chọn được hiển thị; Ngữ pháp và Thành ngữ vẫn tải dữ liệu theo nhu cầu.
   - Thêm nút **Chọn mục khác** để quay lại ba lựa chọn.

6. **Âm thanh lần đầu truy cập**
   - Trailer mặc định ưu tiên phát có tiếng cho người dùng mới.
   - Nếu trình duyệt chặn autoplay có tiếng, trailer phát tạm ở chế độ im lặng và tự mở tiếng ở thao tác đầu tiên của người dùng.
   - Lựa chọn bật/tắt âm thanh được lưu trong `localStorage`.
   - Video banner trang trí vẫn để im lặng nhằm không phá autoplay và tránh phát hai nguồn âm thanh cùng lúc.

## Tệp chính đã thay đổi

- `assets/data/all.json`
- `assets/data/tang-thu-cac/standard-hanzi-8105-additions.json`
- `assets/data/tang-thu-cac/hsk-2026-levels.json`
- `assets/data/tang-thu-cac/hsk-classification-manifest.json`
- `scripts/apply-hsk-levels.py`
- `vocabulary.html`
- `assets/js/tang-thu-cac.js`
- `assets/css/tang-thu-cac.css`
- `index.html`
- `assets/js/home-trailer.js`
- `.env.example`

## Kiểm tra đã chạy

- `python scripts/apply-hsk-levels.py --check` — đạt, 0 mục chưa phân loại.
- `node --check assets/js/home-trailer.js` — đạt.
- `node --check assets/js/tang-thu-cac.js` — đạt.
- Kiểm tra cú pháp JavaScript nội tuyến của `vocabulary.html` — đạt.
- `npm run check` — đạt toàn bộ kiểm tra Pinyin, writing và VIP security.

## Lưu ý bảo mật

`.env.local` không được đưa vào gói ZIP trả lại vì có thể chứa khóa bí mật. File `.env.example` chỉ giữ tên biến và bỏ toàn bộ giá trị.
