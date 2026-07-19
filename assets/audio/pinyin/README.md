# Bộ audio Pinyin HSK1

Bộ này chứa 65 file WAV tĩnh cho bài `hsk1-pinyin-intro`: 21 thanh mẫu, 20 vận mẫu, 5 thanh điệu, 3 âm tiết, 6 ví dụ và 10 file so sánh. Trang bài học phát trực tiếp các file này; không gọi API TTS và không dùng giọng trình duyệt làm phương án dự phòng.

## Nguồn và định dạng

- Locale: `zh-CN`.
- Giọng tạo bộ hiện tại: Microsoft Edge neural TTS, `zh-CN-XiaoxiaoNeural`.
- Đầu vào tạo giọng chỉ gồm chữ Hán và dấu câu tiếng Trung. Ký tự Pinyin Latin đứng riêng không được gửi vào TTS.
- Định dạng chuẩn: WAV PCM 16-bit, mono, 24 kHz.
- Âm lượng được chuẩn hóa gần -20 dBFS; file được phát ở tốc độ 1x trong trình duyệt để không kéo giãn đường cao độ.

Thông tin nguồn chi tiết, SHA-256 và kết quả kiểm tra của từng file nằm trong `manifest.json`. Khi phân phối hoặc cấp phép lại các file audio độc lập với website, cần tự xác nhận điều khoản sử dụng của nhà cung cấp giọng.

## Trạng thái kiểm tra

- 65/65 file đã qua kiểm tra tự động về cấu trúc WAV, thời lượng, âm lượng, clipping, khoảng lặng và đường cao độ của các thanh điệu bắt buộc.
- Người dùng đã nghe và chấp nhận bộ hiện tại ngày 2026-07-18.
- Kiểm duyệt bởi chuyên gia/người bản ngữ vẫn ở trạng thái `pending`; không tuyên bố phát âm đã được xác minh 100%.

Chạy kiểm tra không làm thay đổi file:

```powershell
npm run check:pinyin
```

## Thay audio

1. Thay file gốc trong đúng thư mục `initials`, `finals`, `tones`, `syllables` hoặc `examples`; giữ nguyên tên file nếu không muốn sửa ánh xạ giao diện.
2. File đầu vào phải là WAV PCM 16-bit, mono, 24 kHz. Nếu đổi nguồn giọng, khai báo đúng metadata trước khi hoàn tất:

```powershell
$env:PINYIN_AUDIO_PROVIDER='ten-nha-cung-cap'
$env:PINYIN_AUDIO_MODEL='ten-model'
$env:PINYIN_AUDIO_VOICE='ten-giong'
$env:TTS_VOICE_VERSION='phien-ban'
node tools/build-pinyin-audio.mjs --finalize-only
npm run check:pinyin
```

Lệnh hoàn tất sẽ chuẩn hóa các file gốc, tạo lại 10 file so sánh, tính lại SHA-256 và cập nhật `manifest.json`. File không vượt QC sẽ bị từ chối; không hạ ngưỡng kiểm tra chỉ để ép file vượt qua.
