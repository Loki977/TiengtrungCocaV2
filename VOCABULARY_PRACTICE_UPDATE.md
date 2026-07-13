# Cập nhật luyện từ vựng

## File đã sửa
- `assets/js/lesson-render.js`: thay câu ví dụ có sẵn bằng khu vực người học tự đặt câu.
- `assets/css/giaotrinhhsk.css`: thêm giao diện responsive cho ô đặt câu và luyện đọc.
- `hsk.html`: nạp module luyện tập mới.

## File mới
- `assets/js/vocabulary-practice.js`

## Chức năng
- Người học nhập câu tiếng Trung có chứa từ đang học.
- Kiểm tra cơ bản: có từ mục tiêu, có chữ Hán, đủ độ dài, tránh dữ liệu lặp bất thường.
- Xin quyền micro và nhận diện tiếng Trung `zh-CN`.
- Luyện đọc riêng từ vựng hoặc câu do người học đặt.
- Lưu kết quả vào localStorage; nếu đã đăng nhập và Firebase sẵn sàng thì đồng bộ vào `users/{uid}/private/vocabularyPractice`.
- Lỗi micro/Firebase không chặn luồng học và không ảnh hưởng đăng nhập.

## Lưu ý
- Nhận diện giọng nói hoạt động tốt nhất trên Chrome/Edge và website HTTPS.
- Đây là chấm phát âm theo kết quả nhận diện, chưa phải chấm chính xác từng thanh điệu như dịch vụ chuyên dụng.
