# Module Thi Thử nhẹ cho TiengtrungCocaV2

## 1. Cách chép vào dự án

Giải nén rồi chép toàn bộ nội dung của thư mục này vào:

```text
E:\TiengtrungCocaV2
```

Các file chính:

```text
ThiThu.html
ThiThu-Editor.html
assets/css/thi-thu.css
assets/js/thi-thu/
assets/data/thi-thu/
tools/
```

## 2. Đăng nhập được thiết kế thế nào?

Module **không tạo Firebase app mới** và không lưu mật khẩu.

Nó chờ đối tượng có sẵn:

```js
window.sharedFirebase.auth
```

được tạo bởi:

```text
assets/js/firebase-auth.js
```

Nếu chưa đăng nhập, trang chuyển người dùng về trang được khai báo trong:

```text
assets/data/thi-thu/config.json
```

Mặc định:

```json
{
  "auth": {
    "required": true,
    "loginPage": "./login.html",
    "returnParam": "return"
  }
}
```

Nếu dự án dùng tên trang đăng nhập khác, chỉ sửa `loginPage`.

Để cho phép khách làm bài mà không đăng nhập:

```json
"required": false
```

## 3. Cách thêm đề mới nhanh nhất

### Bước 1: Tạo file đề

Sao chép:

```text
assets/data/thi-thu/exams/hsk4-demo-01.json
```

thành ví dụ:

```text
assets/data/thi-thu/exams/hsk5-de-01.json
```

Sửa `id`, `title`, `level`, thời gian và danh sách câu hỏi.

### Bước 2: Khai báo đề trong index.json

Mở:

```text
assets/data/thi-thu/exams/index.json
```

Thêm:

```json
{
  "id": "hsk5-de-01",
  "title": "Đề thi thử HSK 5 — Số 01",
  "level": "HSK 5",
  "description": "Mô tả ngắn",
  "durationMinutes": 120,
  "questionCount": 100,
  "active": true,
  "path": "./assets/data/thi-thu/exams/hsk5-de-01.json"
}
```

## 4. Loại câu hỏi đang hỗ trợ

### Chọn một đáp án

```json
{
  "id": "q1",
  "type": "single_choice",
  "points": 1,
  "prompt": "Nội dung câu hỏi",
  "options": [
    {"id": "A", "text": "Đáp án A"},
    {"id": "B", "text": "Đáp án B"}
  ],
  "answer": "A",
  "explanation": "Giải thích sau khi nộp bài"
}
```

### Đúng / Sai

```json
{
  "id": "q2",
  "type": "true_false",
  "points": 1,
  "prompt": "Nội dung nhận định",
  "answer": "true"
}
```

### Điền đáp án

```json
{
  "id": "q3",
  "type": "fill_blank",
  "points": 1,
  "prompt": "Nhập đáp án",
  "answer": "但是",
  "acceptedAnswers": ["但是", "可是"]
}
```

## 5. Trình biên tập

Mở:

```text
ThiThu-Editor.html
```

Chức năng:

- Mở file JSON.
- Nạp đề mẫu.
- Định dạng JSON.
- Kiểm tra cấu trúc.
- Tải file JSON đã sửa.

Trang này chỉ tạo file tải về, không tự ghi vào GitHub hay ổ đĩa dự án. Sau khi tải, chép file vào `assets/data/thi-thu/exams/`.

## 6. Chạy thử bằng Python

Trong thư mục dự án:

```powershell
python tools\dev_server.py --root . --port 5500
```

Mở:

```text
http://127.0.0.1:5500/ThiThu.html
```

Không nên mở HTML trực tiếp bằng `file://` vì trình duyệt sẽ chặn `fetch()` JSON.

## 7. Kiểm tra nhanh bằng C

Có thể bỏ qua phần này. Đây là tiện ích nhẹ để kiểm tra file có các trường cơ bản.

```powershell
gcc tools\validate_exam.c -o tools\validate_exam.exe
tools\validate_exam.exe assets\data\thi-thu\exams\hsk4-demo-01.json
```

## 8. Lưu tiến độ

Tiến độ đang làm được lưu bằng `localStorage`, tách riêng theo:

```text
uid Firebase + id đề thi
```

Cách này nhẹ, không phát sinh lượt đọc/ghi Firestore.

Khi cần đồng bộ đa thiết bị, có thể thay lớp lưu tiến độ bằng Firestore mà không phải sửa cấu trúc đề thi.

## 9. Gợi ý tích hợp vào trang chủ

Thêm liên kết:

```html
<a href="./ThiThu.html">Thi thử HSK</a>
```

## 10. Khi nhận đề thi thật

Nên chuyển tài liệu thành JSON theo cùng schema. Với đề nghe, bổ sung trường `audio` cho section hoặc question và thêm một audio player nhỏ trong `app.js`.
