# Báo cáo hoàn thiện VIP trước production

## Trạng thái

- Đã sửa trong working copy.
- Chưa commit, chưa push và chưa deploy.
- File ZIP nguồn không chứa thư mục `.git`, vì vậy không thể chạy `git diff/status`; thay vào đó đã so sánh byte theo từng file với bản giải nén gốc.
- Không sửa `assets/js/spirit-pet.js` và không gom các thay đổi tối ưu cuộn/Profile không liên quan.

## File thuộc thay đổi VIP

1. `firestore.rules`
2. `assets/js/vip-user.js`
3. `assets/css/vip-user.css`
4. `assets/js/firebase-auth.js`
5. `assets/js/hsk.js`
6. `lesson-page.js`
7. `assets/js/admin-super.js`
8. `assets/css/admin-super.css`
9. `profile.html`
10. `scripts/test-vip-security.mjs`
11. `package.json` (chỉ thêm lệnh `test:vip` và nối vào `npm run check`)

## Nội dung đã hoàn thiện

### Firestore

- User thường chỉ được tạo/cập nhật các trường tiến độ được whitelist trong `users/{uid}/private/stats`.
- `isVip`, `vipUntil`, `vipPlan`, `role`, permissions, admin claims và trường đặc quyền mới không nằm trong whitelist.
- Kiểm tra cả `create` và `update` bằng `keys().hasOnly(...)` và `affectedKeys().hasOnly(...)`.
- Chỉ email `nqthanhforwork@gmail.com` được ghi trường VIP/đặc quyền.
- Luồng XP, xu, streak, điểm danh, bài hoàn thành, luyện viết, thử thách và mở bài bằng xu vẫn nằm trong whitelist.

### Helper VIP dùng chung

- Chỉ hợp lệ khi `isVip === true`.
- `vipUntil === null` là vĩnh viễn.
- `vipUntil` còn tương lai là còn hạn; thiếu/sai/hết hạn đều là user thường.
- Khi object gồm public data và `stats`, chỉ `private/stats` được dùng làm nguồn quyền.
- Quyền hiển thị/khóa không lấy từ localStorage.

### Khóa bài và URL trực tiếp

- `hsk.js` và `lesson-page.js` đọc cấu hình khóa bài mới nhất bằng `getDocFromServer`.
- Bài VIP chờ Firebase Auth và đọc `private/stats` từ Firestore server trước khi tải JSON/render.
- Mất mạng, Auth chậm hoặc không xác minh được: fail-closed, không render bài VIP.
- User thường, chưa đăng nhập hoặc hết hạn: mở modal gói VIP/QR và có đường quay lại danh sách bài.
- Bài miễn phí vẫn dùng luồng cũ sau khi cấu hình truy cập được xác minh.

### Admin Super

- Có các lựa chọn: vĩnh viễn, 30 ngày, 90 ngày, 365 ngày, ngày tùy chọn và tắt VIP.
- Có nút gia hạn; nếu còn hạn thì cộng từ hạn hiện tại, nếu hết hạn thì cộng từ thời điểm hiện tại.
- Hạn VIP được ghi bằng Firestore `Timestamp`; vĩnh viễn ghi `null`.
- Trạng thái hiển thị: Không VIP, VIP vĩnh viễn, Còn X ngày, Đã hết hạn.
- Mọi ghi VIP vào `private/stats`; không còn dùng boolean public làm nguồn quyền.

### Avatar, mua VIP và Profile

- Avatar Admin dùng renderer chung; ảnh rỗng/lỗi có fallback chữ cái và vẫn giữ khung VIP hợp lệ.
- Modal mua VIP có giá cập nhật:
  - 1 tháng: 69.000đ
  - 6 tháng: 299.000đ
  - 1 năm: 389.000đ
  - Vĩnh viễn: 459.000đ
- Đã xóa gói mua 3 tháng khỏi giao diện khách hàng. Tùy chọn 90 ngày trong Admin vẫn được giữ để quản trị viên cấp/gia hạn thủ công.
- Modal có hiệu ứng mở, quầng sáng, ánh sao, shimmer trên gói, nhịp sáng gói đã chọn, hiệu ứng hiện khu vực thanh toán và phát sáng QR; tự tắt chuyển động khi thiết bị bật `prefers-reduced-motion`.
- Chọn từng gói sẽ hiện QR, MB Bank, chủ tài khoản, số tài khoản và nội dung chuyển khoản.
- Đổi background chỉ hoạt động khi VIP đã được xác minh từ Firestore.
- Linh thú ẩn ngay từ HTML với user thường/chưa xác minh để tránh nháy nội dung.

## Kết quả kiểm thử

- `npm run test:vip`: PASS.
- `npm run check`: PASS.
- Node syntax check cho `vip-user.js`, `firebase-auth.js`, `hsk.js`, `admin-super.js`, `lesson-page.js`: PASS.
- Inline JavaScript trong `profile.html`: PASS syntax check.
- Bộ test VIP đã kiểm tra:
  - user thường;
  - VIP vĩnh viễn;
  - VIP còn hạn với object mô phỏng Firestore Timestamp;
  - VIP hết hạn;
  - thiếu `vipUntil`;
  - `isVip` sai kiểu;
  - ưu tiên `private/stats`;
  - fallback avatar rỗng và khung VIP;
  - whitelist rules không có trường đặc quyền;
  - guard chạy trước khi tải nội dung JSON;
  - Admin dùng Timestamp và có cơ chế gia hạn;
  - QR và đủ 5 mức giá tồn tại.

### Kiểm thử chưa thể xác nhận hoàn toàn trong sandbox

- Chưa chạy Firebase Emulator/Rules Unit Testing thực tế vì `firebase-tools` không có sẵn và tải qua `npx` bị timeout trong môi trường hiện tại.
- Chưa chạy đăng nhập Firebase thật hoặc thao tác Admin thật vì không có phiên/credentials production trong sandbox.
- Vì vậy sau khi được xác nhận, cần deploy rules lên staging trước và test trực tiếp: user thường tự ghi `isVip`/`vipUntil` phải nhận `permission-denied`; Admin cấp/gia hạn/thu hồi phải thành công.

## Giới hạn bảo mật còn lại

Client-side guard không thể bảo mật tuyệt đối các tài nguyên public. Các đường dẫn sau vẫn có thể bị tải trực tiếp nếu biết URL:

- `assets/giaotrinhhsk/hsk1..hsk6/index.json`
- `assets/giaotrinhhsk/hsk1..hsk6/lesson-*.json`
- `assets/data/hsk1.json` đến `assets/data/hsk6.json`
- `assets/data/writing/hsk5.json`, `assets/data/writing/hsk6.json`
- `assets/images/background/**`
- `assets/images/Pet/**`, `assets/images/Pet2/**`

Ngoài ra Firestore Rules hiện vẫn cho đọc public các collection `lessonOverrides`, `courses`, `lessonContents`. Nếu các collection này chứa nội dung VIP, người dùng có thể gọi Firestore trực tiếp mà không qua UI.

Để bảo mật tuyệt đối, cần chuyển nội dung VIP sang API/Cloud Function/backend, xác minh Firebase ID token và đọc `users/{uid}/private/stats` phía server trước khi trả dữ liệu; ảnh/video cần signed URL hoặc endpoint có kiểm tra quyền. Việc tái cấu trúc này chưa được thực hiện theo yêu cầu không tự thay đổi kiến trúc lớn.

## Thứ tự đưa production sau khi xác nhận

1. Tạo staging/backup Firestore Rules hiện tại.
2. Deploy Rules trước: `firebase deploy --only firestore:rules`.
3. Test permission-denied bằng tài khoản thường và các thao tác VIP bằng Super Admin.
4. Sau khi Rules đạt mới deploy frontend.
5. Kiểm tra URL bài VIP trực tiếp, mạng chậm/mất mạng, avatar rỗng, background và linh thú trên PC/điện thoại.
