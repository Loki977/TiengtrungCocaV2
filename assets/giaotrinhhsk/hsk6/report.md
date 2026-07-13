# HSK6 lesson JSON generation report

Generated: 2026-07-08T09:21:09

## Files scanned
- Textbook files found: 2
- HSK 6  chuẩn quyển hạ.pdf
- HSK 6 chuẩn quyển thượng.pdf
- Exercise files found: 4
- HSK6-BH-T1-DA.pdf
- HSK6-BH-T2-DA.pdf
- HSK6-BT-T1-DA.pdf
- HSK6-BT-T2-DA.pdf
- Audio files found: 80

## Output
- `index.json`
- `audio-map.json`
- `lesson-01.json` → `lesson-40.json`
- Total lessons: 40

## Audio mapping
- Lessons with audio: 40 / 40
- Missing audio: Không có
- Mỗi lesson đang map 2 file audio theo dạng `assets/audio/hsk6/lessonXX/XX-1.mp3`, `XX-2.mp3`.

## Design notes
- Lesson 01 dùng bản đã duyệt theo khung `lesson-01(3).json`.
- Lesson 02–40 được sinh lại cùng schema: `title`, `icon`, `xp`, `desc`, `meta`, `audio`, `vocabulary`, `extendedVocabulary`, `lessonText`, `story`, `culture`, `grammar`, `exercises`, `smartCheck`.
- Không sao chép nguyên văn bài khóa dài từ giáo trình. Bài khóa trong `lessonText` và `story` là nội dung mới, dùng chủ đề/từ vựng/ngữ pháp phù hợp HSK6.
- Vì PDF giáo trình là bản scan/ảnh và trích xuất text trực tiếp kém, phần mục lục/từ mới/ngữ pháp cho các lesson sau được thiết kế theo chủ đề HSK6 và cần kiểm tra thủ công nếu muốn khớp tuyệt đối từng bài trong sách.
- Trường `pinyin` trong `lessonText/story` của lesson 02–40 để trống để tránh sinh pinyin sai tự động; từ vựng có pinyin cấp từ.

## Lessons cần kiểm tra thủ công
- Lesson 02–40: nên đối chiếu lại tên bài gốc, danh sách từ mới chính xác và điểm ngữ pháp nếu yêu cầu bám sát 100% giáo trình scan.

## Exercise coverage
Mỗi lesson có đủ dạng:
- multiple-choice
- fill-blank
- sentence-order
- error-correction
- translation
- reading
- writing
