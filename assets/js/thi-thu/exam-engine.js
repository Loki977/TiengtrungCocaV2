function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('vi').replace(/\s+/g, ' ');
}

export function flattenQuestions(exam) {
  return (exam.sections || []).flatMap(section =>
    (section.questions || []).map(question => ({
      ...question,
      sectionId: section.id,
      sectionTitle: section.title,
      points: Number(question.points || 1)
    }))
  );
}

export function scoreExam(exam, answers) {
  const details = flattenQuestions(exam).map(question => {
    const userAnswer = answers[question.id];
    const accepted = question.type === 'fill_blank'
      ? (question.acceptedAnswers || [question.answer])
      : [question.answer];
    const isCorrect = accepted.some(answer => normalizeText(answer) === normalizeText(userAnswer));
    return { question, userAnswer, isCorrect };
  });

  const sectionScores = (exam.sections || []).map(section => {
    const rows = details.filter(item => item.question.sectionId === section.id);
    return {
      id: section.id,
      title: section.title,
      earned: rows.reduce((sum, item) => sum + (item.isCorrect ? item.question.points : 0), 0),
      maxScore: rows.reduce((sum, item) => sum + item.question.points, 0)
    };
  });
  const earned = sectionScores.reduce((sum, section) => sum + section.earned, 0);
  const maxScore = sectionScores.reduce((sum, section) => sum + section.maxScore, 0);
  return {
    earned,
    maxScore,
    percentage: maxScore ? Math.round(earned / maxScore * 100) : 0,
    correct: details.filter(item => item.isCorrect).length,
    wrong: details.filter(item => !item.isCorrect).length,
    details,
    sectionScores
  };
}

export function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
