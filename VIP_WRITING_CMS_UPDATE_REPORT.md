# Báo cáo cập nhật VIP và Luyện viết

## Trạng thái

- Working copy đã hoàn thiện theo yêu cầu mới.
- Chưa commit Git, chưa push GitHub và chưa deploy Vercel/Firebase.
- Chỉ sửa các file liên quan trực tiếp đến VIP, Luyện viết, CMS và kiểm thử tương ứng.

## 1. CMS Luyện viết

Đã thêm tab **Luyện viết** vào Admin Super với các chức năng:

- Chọn HSK1–HSK6 và từng bài.
- Sửa tiêu đề, mô tả, XP, danh sách từ và câu luyện viết.
- Chế độ chỉnh nhanh theo từng dòng và JSON nâng cao.
- Kiểm tra tối thiểu theo cấp độ trước khi lưu.
- Lưu override vào `writingLessonOverrides/{level}_{lessonId}`.
- Nạp lại dữ liệu JSON chuẩn, xóa override và tải JSON xuống.
- Trang danh sách Luyện viết đọc override theo đúng HSK; nếu Firestore chậm, lỗi hoặc mất mạng thì tự dùng dữ liệu chuẩn sau tối đa khoảng 3 giây.
- `lesson-page.js` đọc một override tương ứng trước khi render bài.

Firestore Rules chỉ cho Super Admin `nqthanhforwork@gmail.com` tạo, sửa hoặc xóa `writingLessonOverrides`. Nội dung học vẫn được phép đọc công khai vì dữ liệu gốc hiện là JSON public.

## 2. Dữ liệu Luyện viết

Đã tách và sinh lại kho dữ liệu tại `assets/data/writing/` từ giáo trình hiện có và `assets/data/all.json`:

| Cấp độ | Số bài | Từ mỗi bài | Tổng từ | Câu mỗi bài | Tổng câu |
|---|---:|---:|---:|---:|---:|
| HSK2 | 15 | 20 | 300 | 10 | 150 |
| HSK3 | 20 | 30 | 600 | 10 | 200 |
| HSK4 | 20 | 40 | 800 | 10 | 200 |
| HSK5 | 36 | 40 | 1.440 | 10 | 360 |
| HSK6 | 40 | 50 | 2.000 | 10 | 400 |

Nguyên tắc sinh dữ liệu:

- Ưu tiên từ chính và từ mở rộng của đúng bài.
- Ưu tiên từ xuất hiện trong bài khóa/chủ đề.
- Chỉ bổ sung từ kho từ điển khi bài chưa đủ số lượng.
- Không lặp từ giữa các bài trong cùng cấp độ.
- Mỗi bài giữ 10 câu có chữ Hán, pinyin và nghĩa Việt đầy đủ.
- Đã loại các câu máy móc như “本课重点表达包括…” hoặc “这个词和第…课的主题有关”.
- Script sinh dữ liệu có tính xác định; `--check` xác nhận JSON đang đồng bộ với nguồn.

## 3. Cách chấm và điều hướng

- Gõ trong ô không còn tự chấm.
- Nhấn Enter không chấm; giao diện yêu cầu bấm **Kết quả**.
- Chỉ tính đúng khi toàn bộ đáp án khớp sau chuẩn hóa hợp lý:
  - chữ Hán: cho phép khác dấu câu/khoảng trắng nhưng không được thiếu chữ;
  - pinyin: cho phép nhập không dấu thanh nhưng phải đủ âm tiết;
  - tiếng Việt: không phân biệt hoa/thường và dấu câu, nhưng phải đủ nội dung và giữ đúng dấu tiếng Việt.
- Trả lời đúng không tự chuyển câu; người học tự bấm **Tiếp**.
- Câu luyện viết vẫn đọc đáp án xong mới mở nút Tiếp để tránh cắt âm thanh.

## 4. Tốc độ đọc

- Đọc thường: `0.58`, bằng tốc độ “đọc chậm” trước đây.
- Đọc chậm: `0.35`, tương đương giảm thêm khoảng 40% từ `0.58`.

## 5. Bảng mua VIP

Gói khách hàng hiện có:

- 1 tháng: **69.000đ**
- 6 tháng: **299.000đ**
- 1 năm: **389.000đ**
- Vĩnh viễn: **459.000đ**

Đã xóa gói mua 3 tháng. Tùy chọn 90 ngày trong Admin Super vẫn giữ để cấp hoặc gia hạn thủ công.

Hiệu ứng mới:

- modal mở bằng fade/scale/slide;
- viền quầng sáng chuyển động;
- lớp aurora và ánh sao;
- shimmer khi rê/chọn gói;
- icon gói chuyển động nhẹ;
- gói phổ biến và giá tốt nhất có cách nhấn mạnh riêng;
- khu vực QR hiện bằng animation, QR có hiệu ứng ánh sáng;
- có xử lý `prefers-reduced-motion` để đảm bảo khả năng tiếp cận và giảm tải thiết bị yếu.

## 6. File thay đổi

- `admin-super.html`
- `assets/css/admin-super.css`
- `assets/css/vip-user.css`
- `assets/data/writing/hsk2.json`
- `assets/data/writing/hsk3.json`
- `assets/data/writing/hsk4.json`
- `assets/data/writing/hsk5.json`
- `assets/data/writing/hsk6.json`
- `assets/js/admin-super.js`
- `assets/js/vip-user.js`
- `firestore.rules`
- `hsk1-writing-lessons.html`
- `lesson-config.js`
- `lesson-engine.js`
- `lesson-page.js`
- `package.json`
- `scripts/build-writing-content.mjs`
- `scripts/test-vip-security.mjs`
- `scripts/test-writing-quality.mjs`
- `VIP_PRODUCTION_REPORT.md`
- `VIP_WRITING_CMS_UPDATE_REPORT.md`

Không sửa `spirit-pet`, tối ưu cuộn hoặc các phần Profile không liên quan trong đợt này.

## 7. Kiểm thử

Đã chạy thành công:

- `npm run build:writing-data`
- `npm run check`
- `npm run test:writing`
- `npm run test:vip`
- `node --check` cho `vip-user.js`, `admin-super.js`, `lesson-config.js`, `lesson-engine.js`, `lesson-page.js` và các file cốt lõi khác trong script `check`.
- Kiểm tra HTML không có ID trùng trong `admin-super.html`, `hsk1-writing-lessons.html`, `lesson.html`, `profile.html`.
- Kiểm tra cú pháp module inline của trang danh sách Luyện viết.
- Kiểm tra số lượng, tính duy nhất của từ/câu, pinyin, bản dịch và các mẫu câu máy móc bị cấm.
- Kiểm tra bảng mua VIP chỉ có bốn mức giá mới.
- Kiểm tra Rules chỉ cho Super Admin ghi CMS Luyện viết.

## 8. Giới hạn cần test staging

Môi trường hiện tại không có trình duyệt tự động và Firebase Emulator, nên chưa thể mô phỏng thao tác click thật hoặc xác nhận Rules với project Firebase thật. Trước production cần kiểm tra staging:

1. Admin đăng nhập, sửa một bài Luyện viết, lưu, tải lại danh sách và mở bài.
2. User thường thử ghi/xóa `writingLessonOverrides` và phải nhận `permission-denied`.
3. Test modal VIP trên điện thoại, đặc biệt màn hình nhỏ và chế độ giảm chuyển động.
4. Test TTS thật trên Chrome Android, Safari iOS và máy tính.
5. Deploy `firestore.rules` trước hoặc đồng thời với mã CMS; nếu chỉ deploy giao diện, thao tác lưu CMS sẽ bị từ chối.

Giới hạn bảo mật VIP trước đây vẫn còn: file JSON/static public không thể được bảo vệ tuyệt đối chỉ bằng JavaScript phía client. Muốn chống tải trực tiếp cần chuyển nội dung VIP sang API/backend xác minh Firebase ID token.
