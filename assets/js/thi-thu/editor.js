import { validateExam } from './data-loader.js';

const $ = selector => document.querySelector(selector);
const editor = $('#jsonEditor');
const output = $('#validationOutput');
const fileInput = $('#fileInput');
const filenameInput = $('#filenameInput');

async function loadSample() {
  const response = await fetch('./assets/data/thi-thu/exams/hsk4-demo-01.json', { cache: 'no-cache' });
  const data = await response.json();
  editor.value = JSON.stringify(data, null, 2);
  filenameInput.value = `${data.id || 'de-thi-moi'}.json`;
  output.textContent = 'Đã nạp dữ liệu mẫu.';
}

function parseEditor() {
  try {
    return { data: JSON.parse(editor.value), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

function validate() {
  const parsed = parseEditor();
  if (parsed.error) {
    output.textContent = `JSON không hợp lệ:\n${parsed.error.message}`;
    return false;
  }
  const errors = validateExam(parsed.data);
  output.textContent = errors.length
    ? `Có ${errors.length} lỗi:\n- ${errors.join('\n- ')}`
    : 'Hợp lệ. Có thể đưa file này vào assets/data/thi-thu/exams/.';
  return errors.length === 0;
}

$('#openBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  if (!file) return;
  editor.value = await file.text();
  filenameInput.value = file.name;
  validate();
});

$('#sampleBtn').addEventListener('click', loadSample);

$('#formatBtn').addEventListener('click', () => {
  const parsed = parseEditor();
  if (parsed.error) {
    output.textContent = `Không thể định dạng:\n${parsed.error.message}`;
    return;
  }
  editor.value = JSON.stringify(parsed.data, null, 2);
  output.textContent = 'Đã định dạng JSON.';
});

$('#validateBtn').addEventListener('click', validate);

$('#downloadBtn').addEventListener('click', () => {
  if (!validate()) return;
  const blob = new Blob([editor.value], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filenameInput.value.trim() || 'de-thi-moi.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

loadSample().catch(error => {
  output.textContent = `Không nạp được mẫu: ${error.message}`;
});
