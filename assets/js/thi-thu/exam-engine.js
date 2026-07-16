function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ');
}

export function flattenQuestions(exam) {
  return exam.sections.flatMap(section =>
    section.questions.map(question => ({
      ...question,
      sectionId: section.id,
      sectionTitle: section.title,
      points: Number(question.points || 1)
    }))
  );
}

export function scoreExam(exam, answers) {
  const questions = flattenQuestions(exam);
  let earned = 0;
  let maxScore = 0;
  const sectionScores = new Map();

  const details = questions.map(question => {
    maxScore += question.points;
    const sectionScore = sectionScores.get(question.sectionId) || {
      id: question.sectionId,
      title: question.sectionTitle,
      earned: 0,
      maxScore: 0
    };
    sectionScore.maxScore += question.points;
    const userAnswer = answers[question.id];

    let isCorrect = false;
    if (question.type === 'fill_blank') {
      const accepted = Array.isArray(question.acceptedAnswers)
        ? question.acceptedAnswers
        : [question.answer];
      isCorrect = accepted.some(answer => normalizeText(answer) === normalizeText(userAnswer));
    } else {
      isCorrect = String(userAnswer) === String(question.answer);
    }

    if (isCorrect) {
      earned += question.points;
      sectionScore.earned += question.points;
    }
    sectionScores.set(question.sectionId, sectionScore);
    return { question, userAnswer, isCorrect };
  });

  return {
    earned,
    maxScore,
    percentage: maxScore ? Math.round((earned / maxScore) * 100) : 0,
    correct: details.filter(item => item.isCorrect).length,
    wrong: details.filter(item => !item.isCorrect).length,
    sectionScores: [...sectionScores.values()],
    details
  };
}

export function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
