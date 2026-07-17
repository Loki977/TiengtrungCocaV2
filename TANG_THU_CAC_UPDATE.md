# Cập nhật Tàng Thư Các

## Nội dung đã hoàn thành

- Đổi mục **Từ vựng** thành **Tàng Thư Các** trong điều hướng chính.
- Giữ nguyên toàn bộ giao diện, dữ liệu và logic tra từ hiện có ở tab **Từ điển**.
- Thêm tab **Ngữ pháp**: 514 mục, thu thập từ Bài khóa HSK1–HSK6, gộp trùng, bổ sung nhóm nền tảng và ngữ pháp nâng cao; hỗ trợ tìm kiếm, lọc HSK, A–Z, xem chi tiết và đọc câu ví dụ.
- Thêm tab **Thành ngữ**: 151 mục; có Pinyin, nghĩa tiếng Việt, cách nói tương đương, sắc thái, chủ đề và ví dụ.
- Dữ liệu Ngữ pháp/Thành ngữ nằm trong JSON riêng và chỉ được tải khi người dùng mở tab tương ứng.
- `grammar.html` cũ chuyển hướng về `vocabulary.html#grammar` để không làm hỏng liên kết cũ.

## Các tệp chính

- `vocabulary.html`
- `grammar.html`
- `assets/css/tang-thu-cac.css`
- `assets/js/tang-thu-cac.js`
- `assets/data/tang-thu-cac/grammar.json`
- `assets/data/tang-thu-cac/idioms.json`
- `scripts/build-tang-thu-cac-data.py`

## Tạo lại dữ liệu

Chạy từ thư mục gốc project:

```bash
python3 scripts/build-tang-thu-cac-data.py
```

Do trình duyệt tải JSON bằng `fetch`, hãy chạy project bằng Live Server, Vercel hoặc một HTTP server; không mở trực tiếp bằng `file://`.
