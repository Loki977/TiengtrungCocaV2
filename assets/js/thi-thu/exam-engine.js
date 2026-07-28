const SUBJECTIVE_WRITING_TYPES = new Set(['short_writing', 'long_writing', 'summary_writing']);

export function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function hasAnswer(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function normalizeWriting(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[，。！？；：、“”‘’（）《》〈〉…—,.!?;:'"()[\]\s]/gu, '');
}

export function isQuestionCorrect(question, keyEntry, userAnswer) {
  if (!hasAnswer(userAnswer) || !keyEntry) return false;
  if (Array.isArray(keyEntry.acceptedAnswers)) {
    const normalized = normalizeWriting(userAnswer);
    return keyEntry.acceptedAnswers.some(answer => normalizeWriting(answer) === normalized);
  }
  return String(userAnswer) === String(keyEntry.correctAnswer);
}

export function evaluateWriting(question, answer) {
  const text = normalizeWriting(answer);
  const required = question.requiredWords || [];
  const missingWords = required.filter(word => !String(answer || '').includes(word));
  const minCharacters = Number(question.minCharacters || 0);
  return {
    characters: [...text].length,
    minCharacters,
    targetCharacters: Number(question.targetCharacters || 0),
    missingWords,
    meetsMinimum: !minCharacters || [...text].length >= minCharacters,
    includesRequiredWords: missingWords.length === 0,
    status: hasAnswer(answer) ? 'pending_grading' : 'unanswered',
  };
}

export function scoreExam(exam, questions, answerKey, answers) {
  let objectiveEarned = 0;
  let objectiveMax = 0;
  let pendingWritingMax = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const sectionMap = new Map();
  const typeMap = new Map();

  const details = questions.map(question => {
    const keyEntry = answerKey.answers[question.id];
    const subjectiveWriting = SUBJECTIVE_WRITING_TYPES.has(question.questionType);
    const answered = hasAnswer(answers[question.id]);
    const weight = Number(question.scoreWeight || 0);
    const section = sectionMap.get(question.sectionId) || {
      id: question.sectionId,
      title: question.sectionTitle,
      earned: 0,
      objectiveMax: 0,
      pendingMax: 0,
      correct: 0,
      total: 0,
    };
    section.total += 1;

    if (subjectiveWriting) {
      if (answered) {
        pendingWritingMax += weight;
        section.pendingMax += weight;
      } else {
        objectiveMax += weight;
        section.objectiveMax += weight;
        unanswered += 1;
      }
      const writingCheck = evaluateWriting(question, answers[question.id]);
      sectionMap.set(question.sectionId, section);
      return { question, keyEntry, userAnswer: answers[question.id], isCorrect: null, writingCheck };
    }

    objectiveMax += weight;
    section.objectiveMax += weight;
    const isCorrect = isQuestionCorrect(question, keyEntry, answers[question.id]);
    if (!answered) unanswered += 1;
    else if (isCorrect) correct += 1;
    else wrong += 1;
    if (isCorrect) {
      objectiveEarned += weight;
      section.earned += weight;
      section.correct += 1;
    }
    sectionMap.set(question.sectionId, section);

    const type = typeMap.get(question.questionType) || { type: question.questionType, correct: 0, total: 0 };
    type.total += 1;
    if (isCorrect) type.correct += 1;
    typeMap.set(question.questionType, type);
    return { question, keyEntry, userAnswer: answers[question.id], isCorrect };
  });

  const sections = [...sectionMap.values()].map(section => ({
    ...section,
    earned: Math.round(section.earned * 100) / 100,
    objectiveMax: Math.round(section.objectiveMax * 100) / 100,
    pendingMax: Math.round(section.pendingMax * 100) / 100,
  }));
  const weakTypes = [...typeMap.values()]
    .filter(item => item.total && item.correct / item.total < 0.6)
    .sort((a, b) => a.correct / a.total - b.correct / b.total);

  return {
    objectiveEarned: Math.round(objectiveEarned * 100) / 100,
    objectiveMax: Math.round(objectiveMax * 100) / 100,
    pendingWritingMax: Math.round(pendingWritingMax * 100) / 100,
    finalMax: exam.totalPoints,
    passPoints: exam.passPoints,
    finalStatus: pendingWritingMax ? 'pending_writing' : (objectiveEarned >= exam.passPoints ? 'passed' : 'not_passed'),
    correct,
    wrong,
    unanswered,
    sections,
    weakTypes,
    details,
  };
}
