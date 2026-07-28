# Báo cáo audit hệ thống thi thử HSK

- Trạng thái: **PASSED**
- Chuẩn mặc định: `HSK_2_0_CURRENT`
- Số đề: 30 (5 đề cho mỗi cấp HSK 1–6)
- Tổng số câu: 2405
- Phân bố: Nghe 1175, Đọc 1050, Viết 180
- Audio: 1182 MP3, 67.34 MiB
- Tham chiếu hình tự tạo: 30
- Lỗi: 0
- Cảnh báo: 0

## Phạm vi kiểm tra tự động

- Đúng số câu, số phần nhỏ, thời gian và repeatCount theo cấu hình HSK 2.0 hiện hành.
- Không trùng question ID trong cùng đề; không để đáp án trong JSON công khai.
- Answer key tồn tại, đáp án trắc nghiệm hợp lệ, acceptedAnswers không rỗng.
- Audio/hình tồn tại; MP3 không rỗng, FFprobe giải mã được, mono 24 kHz và bitrate nằm trong 48–64 kbps; SHA-256 khớp manifest.
- Tổng trọng số mỗi kỹ năng bằng 100 điểm.
- HSK 3–6 không hiển thị pinyin đại trà trong phần Đọc.
- Dữ liệu đề không trộn standardVersion.

## Kiểm thử trình duyệt đã thực hiện

- Guest, desktop: mở danh sách 30 đề, intro HSK 1, bắt đầu official mode, audio tự phát, timer theo timestamp, đáp án tự lưu và phần Đọc bị khóa.
- Guest, mobile 375 × 812: không overflow ngang; topbar logo không sticky; drawer phiếu trả lời mở từ nút đáy, có scrim và vùng chạm phù hợp.
- HSK 6 practice mode: điều hướng tới bài tóm tắt, hiển thị bài nguồn, mục tiêu 400 chữ và phiếu 50 Nghe + 50 Đọc + 1 Viết.
- Console trong luồng mobile không có error/warning.
- Luồng đồng bộ Firebase của tài khoản đăng nhập có fallback local nhưng chưa được ghi thật trong smoke test guest.

## Nguồn cấu trúc và voice

- Chinese Test Service: https://www.chinesetest.cn/HSK/1 đến /HSK/6.
- Thông báo HSK 3.0 thử nghiệm và kỳ thường lệ 2026: https://www.chinesetest.cn/notice.
- Microsoft Azure Speech voice support: https://learn.microsoft.com/azure/ai-services/speech-service/language-support.

## Kết quả theo đề

- hsk1-h10901: 40 câu — listening 20/15 phút, reading 20/17 phút
- hsk1-h10902: 40 câu — listening 20/15 phút, reading 20/17 phút
- hsk1-h11003: 40 câu — listening 20/15 phút, reading 20/17 phút
- hsk1-h11004: 40 câu — listening 20/15 phút, reading 20/17 phút
- hsk1-h11005: 40 câu — listening 20/15 phút, reading 20/17 phút
- hsk2-mock-001: 60 câu — listening 35/25 phút, reading 25/22 phút
- hsk2-mock-002: 60 câu — listening 35/25 phút, reading 25/22 phút
- hsk2-mock-003: 60 câu — listening 35/25 phút, reading 25/22 phút
- hsk2-mock-004: 60 câu — listening 35/25 phút, reading 25/22 phút
- hsk2-mock-005: 60 câu — listening 35/25 phút, reading 25/22 phút
- hsk3-mock-001: 80 câu — listening 40/35 phút, reading 30/30 phút, writing 10/15 phút
- hsk3-mock-002: 80 câu — listening 40/35 phút, reading 30/30 phút, writing 10/15 phút
- hsk3-mock-003: 80 câu — listening 40/35 phút, reading 30/30 phút, writing 10/15 phút
- hsk3-mock-004: 80 câu — listening 40/35 phút, reading 30/30 phút, writing 10/15 phút
- hsk3-mock-005: 80 câu — listening 40/35 phút, reading 30/30 phút, writing 10/15 phút
- hsk4-mock-001: 100 câu — listening 45/30 phút, reading 40/40 phút, writing 15/25 phút
- hsk4-mock-002: 100 câu — listening 45/30 phút, reading 40/40 phút, writing 15/25 phút
- hsk4-mock-003: 100 câu — listening 45/30 phút, reading 40/40 phút, writing 15/25 phút
- hsk4-mock-004: 100 câu — listening 45/30 phút, reading 40/40 phút, writing 15/25 phút
- hsk4-mock-005: 100 câu — listening 45/30 phút, reading 40/40 phút, writing 15/25 phút
- hsk5-mock-001: 100 câu — listening 45/30 phút, reading 45/45 phút, writing 10/40 phút
- hsk5-mock-002: 100 câu — listening 45/30 phút, reading 45/45 phút, writing 10/40 phút
- hsk5-mock-003: 100 câu — listening 45/30 phút, reading 45/45 phút, writing 10/40 phút
- hsk5-mock-004: 100 câu — listening 45/30 phút, reading 45/45 phút, writing 10/40 phút
- hsk5-mock-005: 100 câu — listening 45/30 phút, reading 45/45 phút, writing 10/40 phút
- hsk6-mock-001: 101 câu — listening 50/35 phút, reading 50/50 phút, writing 1/45 phút
- hsk6-mock-002: 101 câu — listening 50/35 phút, reading 50/50 phút, writing 1/45 phút
- hsk6-mock-003: 101 câu — listening 50/35 phút, reading 50/50 phút, writing 1/45 phút
- hsk6-mock-004: 101 câu — listening 50/35 phút, reading 50/50 phút, writing 1/45 phút
- hsk6-mock-005: 101 câu — listening 50/35 phút, reading 50/50 phút, writing 1/45 phút

## Lỗi

- Không có lỗi dữ liệu/tài sản.

## Cảnh báo

- Không có cảnh báo.
