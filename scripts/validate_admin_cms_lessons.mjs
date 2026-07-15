import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const expected = { hsk1:15, hsk2:15, hsk3:20, hsk4:20, hsk5:36, hsk6:40 };
const errors = [];
const report = {};

for (const [level, total] of Object.entries(expected)) {
  const dir = path.join(root, 'assets', 'giaotrinhhsk', level);
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    errors.push(`${level}: thiếu index.json`);
    continue;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const ids = index.map(item => Number(item.lessonId));
  if (index.length !== total) errors.push(`${level}: index có ${index.length}/${total} bài`);
  if (JSON.stringify(ids) !== JSON.stringify(Array.from({ length:total }, (_, i) => i + 1))) {
    errors.push(`${level}: lessonId không liên tục từ 1 đến ${total}`);
  }
  for (const item of index) {
    const lessonPath = path.join(dir, item.file || '');
    if (!item.file || !fs.existsSync(lessonPath)) {
      errors.push(`${level} bài ${item.lessonId}: thiếu file ${item.file || '(trống)'}`);
      continue;
    }
    const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
    if (Number(lesson.lessonId) !== Number(item.lessonId)) errors.push(`${level} bài ${item.lessonId}: lessonId trong file không khớp`);
    if (Number(lesson.level) !== Number(level.slice(3))) errors.push(`${level} bài ${item.lessonId}: level trong file không khớp`);
  }
  report[level] = { lessons:index.length, first:ids[0], last:ids.at(-1) };
}

const adminSource = fs.readFileSync(path.join(root, 'assets', 'js', 'admin-super.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin-super.html'), 'utf8');
for (const [level, total] of Object.entries(expected)) {
  if (!new RegExp(`${level}\\s*:\\s*${total}`).test(adminSource)) errors.push(`CMS thiếu tổng ${level}: ${total}`);
  if (!adminHtml.includes(`${level.toUpperCase()} · ${total} bài`)) errors.push(`CMS chưa hiển thị số lượng ${level}: ${total}`);
}
for (const required of ['cmsEditorBaseline', 'cmsEditorChanged', "cache:'no-store'", 'COURSE_TOTALS[level]']) {
  if (!adminSource.includes(required)) errors.push(`CMS thiếu cơ chế: ${required}`);
}

if (errors.length) {
  console.error(JSON.stringify({ ok:false, errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok:true, totalLessons:Object.values(expected).reduce((a,b)=>a+b,0), report }, null, 2));
}
