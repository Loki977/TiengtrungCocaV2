# Báo cáo kiểm tra và sửa project

## Lỗi đã sửa

- Đăng nhập Google trên mobile:
  - Dùng Firebase authDomain gốc thay vì phụ thuộc proxy cookie của Vercel.
  - Ưu tiên `signInWithPopup()` trên cả PC và mobile.
  - Chỉ fallback sang redirect khi popup thực sự bị trình duyệt chặn.
  - Giữ kiểm tra trình duyệt nhúng và persistence.
  - Xóa log debug dư thừa.

- Linh thú nền đen trên điện thoại:
  - Xác nhận WebM cũ không có alpha thật (`yuv420p`).
  - Chuyển 3 animation lv1/lv5/lv10 thành animated WebP có alpha thật.
  - Đổi trình hiển thị từ `<video>` sang `<img>` động, tương thích mobile tốt hơn.
  - Bỏ logic dò góc đen/cưỡng ép blend không ổn định.

- Logic linh thú thứ hai:
  - Project không có thư mục `assets/images/Pet2` nhưng code vẫn gọi p1/p2/p3.mp4.
  - Tạm ẩn nút chuyển linh thú thứ hai để tránh request 404 và trạng thái lỗi.
  - Có cờ `PET2_AVAILABLE` để bật lại khi bổ sung đủ tài nguyên.

## Dọn dẹp

- Xóa `.git` khỏi gói bàn giao.
- Xóa `functions/node_modules`; dùng `npm install` trong thư mục functions khi cần deploy.
- Xóa WebM cũ sau khi đã thay bằng WebP alpha.
- Xóa các báo cáo/snippet cũ trùng lặp, không tham gia runtime.
- Rút gọn `vercel.json`, loại proxy auth không còn dùng.

## Kiểm tra tự động

- Toàn bộ JavaScript vượt qua `node --check`.
- Toàn bộ JSON parse thành công.
- Không có đường dẫn local bị thiếu trong các file HTML.
- Project sau dọn dẹp còn khoảng 30 MB.

## Lưu ý triển khai Firebase

Trong Firebase Console > Authentication > Settings > Authorized domains, cần có domain đang deploy, ví dụ `tiengtrungcoca.vercel.app`.
