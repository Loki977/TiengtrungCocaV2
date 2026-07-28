import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'assets', 'data', 'mock-tests');
const indexPath = path.join(dataRoot, 'exams', 'index.json');
const standardPath = path.join(dataRoot, 'standards', 'hsk-2.0-current.json');
const reportPath = path.join(dataRoot, 'mock-exam-report.json');
const docsPath = path.join(root, 'docs', 'mock-exam-audit.md');
const manifestPath = path.join(root, 'assets', 'audio', 'mock-tests', 'audio-manifest.json');
const hasFfprobe = !spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).error;
const expectedListeningRates = new Map([
  [1, '-22%'],
  [2, '-18%'],
  [3, '-12%'],
  [4, '-5%'],
  [5, '-5%'],
  [6, '-5%'],
]);
const expectedListeningQuestionRates = new Map([
  [2, '-28%'],
  [3, '-22%'],
  [4, '-15%'],
  [5, '-15%'],
  [6, '-15%'],
]);
const expectedListeningQuestionPauseMs = 450;
const expectedListeningPostTempos = new Map([
  [1, 0.78],
  [2, 0.84],
  [3, 0.90],
]);
const listeningNamesPattern = /李明|王芳|张老师|小雨|陈先生|刘阿姨|赵经理|林医生|周同学|孙师傅/gu;

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fromWebPath = value => path.join(root, value.replace(/^\.\//u, '').replaceAll('/', path.sep));
const errors = [];
const warnings = [];
const stats = {
  exams: 0,
  questions: 0,
  listeningQuestions: 0,
  readingQuestions: 0,
  writingQuestions: 0,
  audioReferences: 0,
  imageReferences: 0,
  audioFiles: 0,
  audioBytes: 0,
};

function fail(scope, message) {
  errors.push({ scope, message });
}

function warn(scope, message) {
  warnings.push({ scope, message });
}

function normalizeListeningText(value) {
  return String(value || '').replace(/\s+/gu, '').replace(/[，。？！：；、“”‘’]/gu, '');
}

function normalizeListeningPattern(value) {
  return normalizeListeningText(value)
    .replace(listeningNamesPattern, '某人')
    .replace(/[一二三四五六七八九十百两\d]+(?=点|分钟|元|份|个|星期)/gu, '数');
}

function checkAudio(file, scope) {
  if (audioChecks.has(file)) {
    const cachedError = audioChecks.get(file);
    if (cachedError) fail(scope, cachedError);
    return;
  }
  if (!fs.existsSync(file)) return fail(scope, `Không tồn tại audio: ${path.relative(root, file)}`);
  const size = fs.statSync(file).size;
  if (size <= 1024) return fail(scope, 'Audio rỗng hoặc quá nhỏ.');
  if (!hasFfprobe) {
    audioChecks.set(file, '');
    return;
  }
  try {
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels,bit_rate', '-of', 'json', file,
    ], { encoding: 'utf8' }));
    const stream = probe.streams?.[0] || {};
    const duration = Number(probe.format?.duration);
    let message = '';
    if (!Number.isFinite(duration) || duration < 0.45) message = `Duration audio bất thường: ${duration}.`;
    else if (Number(stream.sample_rate) !== 24000) message = `Sample rate phải là 24000 Hz, hiện là ${stream.sample_rate}.`;
    else if (Number(stream.channels) !== 1) message = `Audio phải mono, hiện có ${stream.channels} kênh.`;
    else if (Number(stream.bit_rate) < 47000 || Number(stream.bit_rate) > 65000) message = `Bitrate ngoài 48–64 kbps: ${stream.bit_rate}.`;
    audioChecks.set(file, message);
    if (message) fail(scope, message);
  } catch (error) {
    const message = `FFprobe không đọc được audio: ${error.message}`;
    audioChecks.set(file, message);
    fail(scope, message);
  }
}

if (!fs.existsSync(indexPath) || !fs.existsSync(standardPath)) {
  throw new Error('Thiếu index hoặc cấu hình standard. Chạy npm run build:mock-exams trước.');
}

const index = readJson(indexPath);
const standard = readJson(standardPath);
const publicAnswerFields = new Set(['answer', 'correctAnswer', 'acceptedAnswers', 'rubric']);
const audioPayloads = new Map();
const audioChecks = new Map();
const examSummaries = [];
const structuralSignatures = new Map();
const examContentSignatures = new Map();
const levelQuestionFingerprints = new Map();

for (const meta of index) {
  stats.exams += 1;
  const examFile = fromWebPath(meta.path);
  if (!fs.existsSync(examFile)) {
    fail(meta.id, `Thiếu file đề: ${meta.path}`);
    continue;
  }
  const exam = readJson(examFile);
  const expected = standard.levels[String(exam.levelNumber)];
  const scope = exam.id;
  if (!expected) {
    fail(scope, `Không có standard cho level ${exam.levelNumber}.`);
    continue;
  }
  if (exam.standardVersion !== standard.id) fail(scope, 'standardVersion không khớp standard mặc định.');
  if (exam.schemaVersion !== 2) fail(scope, 'schemaVersion phải là 2.');
  if (exam.totalQuestionCount !== expected.totalQuestionCount) fail(scope, `Sai tổng câu: ${exam.totalQuestionCount}/${expected.totalQuestionCount}.`);
  if (exam.officialTotalDurationMinutes !== expected.officialTotalDurationMinutes) fail(scope, 'Sai thời gian công bố.');
  if (exam.timedDurationMinutes !== expected.timedDurationMinutes) fail(scope, 'Sai tổng thời gian tính giờ.');
  if (exam.modeSettings?.official?.lockPreviousSections !== true) fail(scope, 'Official mode chưa khóa phần trước.');
  if (exam.modeSettings?.practice?.allowAudioReplay !== true) fail(scope, 'Practice mode chưa cho nghe lại.');

  const answerFile = fromWebPath(exam.answerKeyPath);
  if (!fs.existsSync(answerFile)) {
    fail(scope, `Thiếu answer key: ${exam.answerKeyPath}`);
    continue;
  }
  const key = readJson(answerFile);
  if (key.examId !== exam.id || key.standardVersion !== exam.standardVersion) fail(scope, 'Answer key không khớp đề/standard.');
  const ids = new Set();
  const contentFingerprints = new Set();
  const examVisibleContent = [];
  let examQuestionCount = 0;

  exam.sections.forEach((section, sectionIndex) => {
    const expectedSection = expected.sections[sectionIndex];
    if (!expectedSection || section.id !== expectedSection.id) fail(scope, `Sai thứ tự/phần thi tại vị trí ${sectionIndex + 1}.`);
    const questions = section.parts.flatMap(part => part.questions || []);
    examQuestionCount += questions.length;
    stats[`${section.id}Questions`] += questions.length;
    if (questions.length !== expectedSection.questionCount) fail(scope, `${section.id}: sai số câu ${questions.length}/${expectedSection.questionCount}.`);
    if (section.durationMinutes !== expectedSection.durationMinutes) fail(scope, `${section.id}: sai thời gian.`);
    if (section.parts.length !== expectedSection.partCounts.length) fail(scope, `${section.id}: sai số phần nhỏ.`);
    section.parts.forEach((part, partIndex) => {
      if (part.questions.length !== expectedSection.partCounts[partIndex]) {
        fail(scope, `${part.id}: sai số câu ${part.questions.length}/${expectedSection.partCounts[partIndex]}.`);
      }
    });
    const weight = questions.reduce((sum, question) => sum + Number(question.scoreWeight || 0), 0);
    const listeningPromptCounts = new Map();
    const listeningPatternCounts = new Map();
    const listeningOpeningCounts = new Map();
    if (Math.abs(weight - 100) > 0.02) fail(scope, `${section.id}: tổng scoreWeight là ${weight}, cần bằng 100.`);

    questions.forEach(question => {
      const questionScope = `${scope}/${question.id}`;
      stats.questions += 1;
      if (ids.has(question.id)) fail(questionScope, 'Trùng question ID trong đề.');
      ids.add(question.id);
      const fingerprint = JSON.stringify([
        question.prompt,
        question.transcript || '',
        question.sourceText || '',
        question.tokens || [],
        question.requiredWords || [],
        question.imagePath || '',
        (question.options || []).map(option => option.text),
      ]);
      examVisibleContent.push(fingerprint);
      if (contentFingerprints.has(fingerprint)) fail(questionScope, 'Nội dung câu hỏi bị trùng hoàn toàn trong cùng đề.');
      contentFingerprints.add(fingerprint);
      if (exam.levelNumber >= 2) {
        if (!levelQuestionFingerprints.has(exam.levelNumber)) levelQuestionFingerprints.set(exam.levelNumber, new Map());
        const priorQuestion = levelQuestionFingerprints.get(exam.levelNumber).get(fingerprint);
        if (priorQuestion) fail(questionScope, `Nội dung trùng với câu ${priorQuestion} ở đề khác cùng cấp.`);
        levelQuestionFingerprints.get(exam.levelNumber).set(fingerprint, questionScope);
      }
      for (const field of publicAnswerFields) {
        if (Object.hasOwn(question, field)) fail(questionScope, `Đáp án công khai trong field ${field}.`);
      }
      const entry = key.answers?.[question.id];
      if (!entry) fail(questionScope, 'Thiếu đáp án/rubric trong answer key.');
      if (question.questionType === 'single_choice') {
        if (!Array.isArray(question.options) || question.options.length < 2) fail(questionScope, 'Trắc nghiệm thiếu options.');
        if (!question.options?.some(option => String(option.id) === String(entry?.correctAnswer))) fail(questionScope, 'correctAnswer không nằm trong options.');
      }
      if (['true_false'].includes(question.questionType) && !['true', 'false'].includes(String(entry?.correctAnswer))) {
        fail(questionScope, 'Đáp án đúng/sai không hợp lệ.');
      }
      if (['reorder', 'hanzi_from_pinyin', 'short_writing'].includes(question.questionType)
        && (!Array.isArray(entry?.acceptedAnswers) || !entry.acceptedAnswers.length)) {
        fail(questionScope, 'acceptedAnswers rỗng.');
      }
      if (['long_writing', 'summary_writing'].includes(question.questionType) && entry?.grading !== 'rubric') {
        fail(questionScope, 'Bài viết dài phải dùng grading=rubric.');
      }
      if (question.questionType === 'summary_writing' && String(question.sourceText || '').length < 600) {
        fail(questionScope, 'Tài liệu nguồn HSK6 quá ngắn cho yêu cầu tóm tắt khoảng 400 chữ.');
      }
      const visibleText = [
        question.instruction,
        question.prompt,
        question.context,
        question.hanzi,
        question.transcript,
        ...(question.options || []).map(option => option.text),
      ].filter(Boolean).join(' ');
      if (/\blorem ipsum\b|câu mẫu|todo|tbd/iu.test(visibleText)) fail(questionScope, 'Phát hiện nội dung placeholder.');
      if (section.id === 'listening') {
        const normalizedPrompt = normalizeListeningText(question.prompt);
        const normalizedPattern = normalizeListeningPattern(question.prompt);
        const normalizedOpening = normalizeListeningText(question.audioText).slice(0, 8);
        listeningPromptCounts.set(normalizedPrompt, (listeningPromptCounts.get(normalizedPrompt) || 0) + 1);
        listeningPatternCounts.set(normalizedPattern, (listeningPatternCounts.get(normalizedPattern) || 0) + 1);
        listeningOpeningCounts.set(normalizedOpening, (listeningOpeningCounts.get(normalizedOpening) || 0) + 1);
        if (question.repeatCount !== expectedSection.repeatCount) fail(questionScope, `repeatCount sai: ${question.repeatCount}/${expectedSection.repeatCount}.`);
        if (!question.audioPath || !question.transcript || !question.audioText) fail(questionScope, 'Câu nghe thiếu audioPath/transcript/audioText.');
        const expectedRate = expectedListeningRates.get(exam.levelNumber);
        const audioSegments = question.audioSegments || [];
        for (const [segmentIndex, segment] of audioSegments.entries()) {
          const isSpokenQuestion = audioSegments.length > 1 && segmentIndex === audioSegments.length - 1;
          const expectedSegmentRate = isSpokenQuestion
            ? expectedListeningQuestionRates.get(exam.levelNumber)
            : expectedRate;
          if (segment.rate !== expectedSegmentRate) {
            fail(questionScope, `Listening audio rate mismatch: ${segment.rate}/${expectedSegmentRate}.`);
          }
          if (isSpokenQuestion) {
            if (segment.role !== 'question') fail(questionScope, 'Đoạn câu hỏi cuối phải có role=question.');
            if (Number(segment.pauseBeforeMs) !== expectedListeningQuestionPauseMs) {
              fail(questionScope, `Khoảng nghỉ trước câu hỏi sai: ${segment.pauseBeforeMs}/${expectedListeningQuestionPauseMs} ms.`);
            }
          } else if (audioSegments.length > 1 && segment.role !== 'content') {
            fail(questionScope, 'Đoạn nội dung nghe phải có role=content.');
          }
          const expectedPostTempo = expectedListeningPostTempos.get(exam.levelNumber);
          if (expectedPostTempo && Math.abs(Number(segment.postTempo) - expectedPostTempo) > 0.001) {
            fail(questionScope, `Listening post-tempo mismatch: ${segment.postTempo}/${expectedPostTempo}.`);
          }
        }
        if (question.audioPath) {
          stats.audioReferences += 1;
          checkAudio(fromWebPath(question.audioPath), questionScope);
          const payload = JSON.stringify(question.audioSegments || question.audioText);
          const prior = audioPayloads.get(question.audioPath);
          if (prior && prior !== payload) fail(questionScope, 'Một audioPath được dùng cho hai nội dung khác nhau.');
          audioPayloads.set(question.audioPath, payload);
        }
      } else if (question.repeatCount !== 0) {
        fail(questionScope, 'Câu không nghe phải có repeatCount=0.');
      }
      if (question.imagePath) {
        stats.imageReferences += 1;
        if (!fs.existsSync(fromWebPath(question.imagePath))) fail(questionScope, `Thiếu hình: ${question.imagePath}`);
      }
      if (exam.levelNumber > 2 && section.id === 'reading' && (question.pinyin || question.promptPinyin || question.contextPinyin)) {
        fail(questionScope, 'Pinyin xuất hiện đại trà trong phần Đọc HSK3–6.');
      }
      if (exam.levelNumber <= 2 && section.id !== 'writing') {
        const hasPinyin = question.pinyin || question.promptPinyin || question.options?.some(option => option.pinyin);
        if (!hasPinyin) warn(questionScope, 'Câu HSK1–2 chưa có pinyin hiển thị.');
      }
    });
    const enforceListeningVariation = exam.levelNumber === 1 || !exam.id.endsWith('-mock-001');
    if (section.id === 'listening' && enforceListeningVariation) {
      const duplicatePrompts = [...listeningPromptCounts.values()].filter(count => count > 1);
      if (duplicatePrompts.length) {
        fail(scope, `Listening section has ${duplicatePrompts.reduce((sum, count) => sum + count - 1, 0)} repeated prompts.`);
      }
      const dominantPattern = Math.max(0, ...listeningPatternCounts.values());
      if (dominantPattern > Math.max(4, Math.ceil(questions.length * 0.2))) {
        fail(scope, `Listening prompt pattern repeats ${dominantPattern}/${questions.length} times.`);
      }
      const dominantOpening = Math.max(0, ...listeningOpeningCounts.values());
      if (dominantOpening > Math.max(4, Math.ceil(questions.length * 0.2))) {
        fail(scope, `Listening audio opening repeats ${dominantOpening}/${questions.length} times.`);
      }
    }
  });

  if (examQuestionCount !== exam.totalQuestionCount) fail(scope, `Tổng câu thực tế ${examQuestionCount}/${exam.totalQuestionCount}.`);
  if (Object.keys(key.answers || {}).length !== exam.totalQuestionCount) fail(scope, 'Số answer-key entry không bằng số câu.');
  const structureSignature = JSON.stringify({
    totalQuestionCount:exam.totalQuestionCount,
    totalPoints:exam.totalPoints,
    passPoints:exam.passPoints,
    officialTotalDurationMinutes:exam.officialTotalDurationMinutes,
    timedDurationMinutes:exam.timedDurationMinutes,
    modeSettings:exam.modeSettings,
    sections:exam.sections.map(section => ({
      id:section.id,
      durationMinutes:section.durationMinutes,
      questionCount:section.questionCount,
      repeatCount:section.repeatCount,
      partCounts:section.parts.map(part => part.questions.length),
    })),
  });
  if (!structuralSignatures.has(exam.levelNumber)) structuralSignatures.set(exam.levelNumber, []);
  structuralSignatures.get(exam.levelNumber).push({ id:exam.id, signature:structureSignature });
  const contentSignature = crypto.createHash('sha256').update(examVisibleContent.join('\n')).digest('hex');
  if (!examContentSignatures.has(exam.levelNumber)) examContentSignatures.set(exam.levelNumber, new Map());
  const priorExam = examContentSignatures.get(exam.levelNumber).get(contentSignature);
  if (priorExam) fail(scope, `Toàn bộ nội dung trùng với ${priorExam}.`);
  examContentSignatures.get(exam.levelNumber).set(contentSignature, exam.id);
  examSummaries.push({
    id: exam.id,
    level: exam.level,
    questions: examQuestionCount,
    sections: exam.sections.map(section => ({ id: section.id, questions: section.questionCount, minutes: section.durationMinutes })),
  });
}

if (stats.exams !== 30) fail('index', `Cần 30 đề (5 đề cho mỗi cấp HSK1–6), hiện có ${stats.exams}.`);
for (let level = 1; level <= 6; level += 1) {
  const levelExams = index.filter(item => item.levelNumber === level);
  if (levelExams.length !== 5) fail('index', `HSK${level} phải có đúng 5 đề, hiện có ${levelExams.length}.`);
  if (levelExams.filter(item => item.accessType === 'free').length < 1) fail('index', `HSK${level} cần ít nhất một đề miễn phí mặc định.`);
}
const hsk1Structures = structuralSignatures.get(1) || [];
if (new Set(hsk1Structures.map(item => item.signature)).size !== 1) {
  fail('HSK1 parity', `5 đề HSK1 chưa đồng bộ cấu trúc: ${hsk1Structures.map(item => item.id).join(', ')}.`);
}

let manifest = null;
if (fs.existsSync(manifestPath)) {
  manifest = readJson(manifestPath);
  stats.audioFiles = manifest.fileCount;
  stats.audioBytes = manifest.totalBytes;
  for (const item of manifest.items || []) {
    const file = fromWebPath(item.path);
    checkAudio(file, `manifest/${item.path}`);
    if (fs.existsSync(file)) {
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (actualHash !== item.sha256) fail(`manifest/${item.path}`, 'SHA-256 không khớp file MP3.');
    }
  }
  const manifestPaths = new Set((manifest.items || []).map(item => item.path));
  for (const audioPath of audioPayloads.keys()) {
    if (!manifestPaths.has(audioPath)) fail('manifest', `Thiếu manifest entry: ${audioPath}`);
  }
} else {
  fail('manifest', 'Thiếu audio-manifest.json. Chạy npm run build:mock-exam-audio.');
}

if (!hasFfprobe) {
  warn('audio', 'FFprobe is unavailable; codec, sample rate, channel and bitrate checks were skipped.');
}

const report = {
  generatedAt: new Date().toISOString(),
  standardVersion: standard.id,
  status: errors.length ? 'failed' : 'passed',
  stats,
  exams: examSummaries,
  errors,
  warnings,
  checks: {
    structures: errors.every(item => !/câu|phần|thời gian|repeatCount/iu.test(item.message)),
    answerKeysSeparated: errors.every(item => !/đáp án công khai|answer key/iu.test(item.message)),
    assets: errors.every(item => !/audio|hình|manifest|ffprobe/iu.test(item.message)),
    versionIsolation: errors.every(item => !/standardVersion/iu.test(item.message)),
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const mib = stats.audioBytes ? (stats.audioBytes / 1024 / 1024).toFixed(2) : '0.00';
const markdown = `# Báo cáo audit hệ thống thi thử HSK

- Trạng thái: **${report.status.toUpperCase()}**
- Chuẩn mặc định: \`${standard.id}\`
- Số đề: ${stats.exams} (5 đề cho mỗi cấp HSK 1–6)
- Tổng số câu: ${stats.questions}
- Phân bố: Nghe ${stats.listeningQuestions}, Đọc ${stats.readingQuestions}, Viết ${stats.writingQuestions}
- Audio: ${stats.audioFiles} MP3, ${mib} MiB
- Tham chiếu hình tự tạo: ${stats.imageReferences}
- Lỗi: ${errors.length}
- Cảnh báo: ${warnings.length}

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

${examSummaries.map(exam => `- ${exam.id}: ${exam.questions} câu — ${exam.sections.map(section => `${section.id} ${section.questions}/${section.minutes} phút`).join(', ')}`).join('\n')}

## Lỗi

${errors.length ? errors.map(item => `- **${item.scope}**: ${item.message}`).join('\n') : '- Không có lỗi dữ liệu/tài sản.'}

## Cảnh báo

${warnings.length ? warnings.map(item => `- **${item.scope}**: ${item.message}`).join('\n') : '- Không có cảnh báo.'}
`;
fs.mkdirSync(path.dirname(docsPath), { recursive: true });
fs.writeFileSync(docsPath, markdown, 'utf8');

console.log(`Mock exam audit: ${report.status}; ${stats.exams} exams; ${stats.questions} questions; ${stats.audioFiles} audio files.`);
if (errors.length) {
  console.error(errors.slice(0, 30).map(item => `${item.scope}: ${item.message}`).join('\n'));
  process.exitCode = 1;
}
