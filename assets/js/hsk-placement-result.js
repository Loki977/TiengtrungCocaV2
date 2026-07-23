import {
  waitForPlacementAuth,
  placementApi,
  showPlacementToast,
  placementLabels
} from './hsk-placement-client.js';
import {
  getLocalPlacementResult,
  getLocalPlacementSyncPayload
} from './hsk-placement-runtime.js';

const byId = (id) => document.getElementById(id);

function buildRecommendations(result) {
  const level = result.estimatedHskLevel;
  const list = [];
  if (result.skills.listening.level < level) {
    list.push(`Ôn nghe HSK ${Math.max(1, level - 1)} bằng hội thoại ngắn, sau đó tăng dần tốc độ.`);
  }
  if (result.skills.reading.level < level) {
    list.push(`Luyện đọc đoạn ngắn và câu hỏi suy luận ở HSK ${Math.max(1, level - 1)}–${level}.`);
  }
  if (result.skills.languageUse.level < level) {
    list.push(`Ưu tiên từ vựng, ngữ pháp và sắp xếp câu ở HSK ${Math.max(1, level - 1)} trước khi lên cấp mới.`);
  }
  if (!list.length) {
    list.push(`Bắt đầu lộ trình HSK ${Math.min(6, level + 1)}, đồng thời dành khoảng 20–30% thời gian ôn HSK ${level}.`);
  }
  list.push('Có thể làm lại sau 3–4 tuần học có chủ đích để hạn chế ảnh hưởng do nhớ câu.');
  return list;
}

function renderResult(result) {
  const level = result.estimatedHskLevel;
  const [low, high] = result.estimatedRange;
  byId('resultLevel').textContent = level;
  byId('confidencePill').textContent = `Độ tin cậy nội bộ: ${placementLabels.confidence[result.confidence] || '–'}`;
  byId('resultHeadline').textContent = low === high
    ? `Nền tảng hiện tại gần HSK ${level}`
    : `HSK ${low} vững, đang tiến tới HSK ${high}`;

  const weakNames = result.needsWork.map((group) => placementLabels.groups[group]);
  const strongNames = result.strengths.map((group) => placementLabels.groups[group]);
  let summary = `Kết quả tổng hợp ${result.answered} câu cho thấy năng lực hiện tại gần HSK ${level}.`;
  if (strongNames.length) summary += ` Điểm mạnh: ${strongNames.join(' và ')}.`;
  if (weakNames.length) summary += ` Nên ưu tiên củng cố ${weakNames.join(' và ')}.`;
  else summary += ' Ba nhóm kỹ năng đang tương đối cân bằng.';
  byId('resultSummary').textContent = summary;

  const skillResults = byId('skillResults');
  skillResults.replaceChildren();
  Object.entries(result.skills).forEach(([group, info]) => {
    const row = document.createElement('div');
    row.className = 'placement-skill-row';
    const header = document.createElement('header');
    const name = document.createElement('strong');
    name.textContent = placementLabels.groups[group];
    const levelText = document.createElement('span');
    levelText.textContent = `Khoảng HSK ${info.level}`;
    header.append(name, levelText);
    const bar = document.createElement('div');
    bar.className = 'placement-skill-bar';
    const fill = document.createElement('div');
    fill.style.width = `${Math.max(12, Math.min(100, (info.level / 6) * 100))}%`;
    bar.appendChild(fill);
    const details = document.createElement('small');
    details.textContent = `${info.answered} câu · ${Math.round(info.accuracy * 100)}% đúng có trọng số`;
    row.append(header, bar, details);
    skillResults.appendChild(row);
  });

  const recommendations = byId('recommendations');
  recommendations.replaceChildren();
  buildRecommendations(result).forEach((text) => {
    const item = document.createElement('div');
    item.className = 'placement-recommendation';
    item.textContent = text;
    recommendations.appendChild(item);
  });

  byId('resultLoading').classList.add('placement-hidden');
  byId('resultScreen').classList.remove('placement-hidden');
}

async function initialize() {
  const attemptId = new URLSearchParams(location.search).get('attemptId') || '';
  const localPayload = getLocalPlacementResult(attemptId);
  if (localPayload?.result) {
    renderResult(localPayload.result);
    void syncLocalResult(attemptId);
    return;
  }

  const user = await waitForPlacementAuth();
  if (!user) {
    byId('resultLoading').querySelector('h1').textContent = 'Chưa có kết quả';
    byId('resultLoading').querySelector('p:last-child').textContent = 'Hãy hoàn thành bài kiểm tra trên thiết bị này để xem kết quả.';
    return;
  }
  try {
    const query = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : '';
    const payload = await placementApi(`result${query}`);
    renderResult(payload.result);
    window.CCFirebase?.ensureUserData?.(user).catch(() => {
      // Kết quả vẫn hiển thị từ API; dữ liệu chung sẽ đồng bộ lại ở lần tải sau.
    });
  } catch (error) {
    byId('resultLoading').querySelector('h1').textContent = 'Chưa có kết quả';
    byId('resultLoading').querySelector('p:last-child').textContent = error.message;
    showPlacementToast(error.message);
  }
}

async function syncLocalResult(attemptId) {
  try {
    const user = await waitForPlacementAuth();
    const payload = getLocalPlacementSyncPayload(attemptId);
    if (!user || !payload) return;
    await placementApi('complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    window.CCFirebase?.ensureUserData?.(user).catch(() => {});
  } catch (error) {
    console.warn('[hsk-placement] Kết quả đang được giữ trên thiết bị và sẽ đồng bộ lại sau.', error);
  }
}

initialize();
