/**
 * Adaptive HSK placement engine.
 * The item parameters are expert-seeded, not empirically calibrated.
 * Results are therefore conservative estimates, not official HSK scores.
 */

export function groupForSkill(skill, config) {
  for (const [group, skills] of Object.entries(config.skillGroups)) {
    if (skills.includes(skill)) return group;
  }
  return 'languageUse';
}

export function createThetaGrid(config) {
  const values = [];
  const { min, max, step } = config.thetaGrid;
  for (let x = min; x <= max + 1e-9; x += step) values.push(Number(x.toFixed(6)));
  return values;
}

function normalPdf(x, mean = 0, sd = 1) {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

export function createPrior(grid, mean = 0, sd = 1.55) {
  const raw = grid.map((theta) => normalPdf(theta, mean, sd));
  return normalize(raw);
}

export function probabilityCorrect(theta, item) {
  const a = Number(item.discrimination ?? 1);
  const b = Number(item.difficulty ?? 0);
  const c = Math.max(0, Math.min(0.35, Number(item.guessing ?? 0)));
  const logistic = 1 / (1 + Math.exp(-a * (theta - b)));
  return c + (1 - c) * logistic;
}

export function normalize(values) {
  const total = values.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return values.map(() => 1 / values.length);
  }
  return values.map((v) => v / total);
}

export function updatePosterior(posterior, grid, item, isCorrect) {
  const updated = posterior.map((prior, index) => {
    const p = Math.min(0.999999, Math.max(0.000001, probabilityCorrect(grid[index], item)));
    return prior * (isCorrect ? p : 1 - p);
  });
  return normalize(updated);
}

export function summarizePosterior(posterior, grid, config) {
  const mean = posterior.reduce((s, p, i) => s + p * grid[i], 0);
  const variance = posterior.reduce((s, p, i) => s + p * (grid[i] - mean) ** 2, 0);
  const sd = Math.sqrt(Math.max(0, variance));
  const levelProbabilities = Array(6).fill(0);
  posterior.forEach((p, i) => {
    levelProbabilities[thetaToLevel(grid[i], config) - 1] += p;
  });
  const bestIndex = levelProbabilities.indexOf(Math.max(...levelProbabilities));
  return {
    mean,
    sd,
    levelProbabilities,
    modalLevel: bestIndex + 1,
    topProbability: levelProbabilities[bestIndex]
  };
}

export function thetaToLevel(theta, config) {
  const b = config.levelBoundaries;
  if (theta < b[0]) return 1;
  if (theta < b[1]) return 2;
  if (theta < b[2]) return 3;
  if (theta < b[3]) return 4;
  if (theta < b[4]) return 5;
  return 6;
}

export function scoreResponse(item, answer) {
  if (item.type === 'choice') return String(answer) === String(item.correct);
  if (item.type === 'order') {
    const submitted = Array.isArray(answer) ? answer : [];
    const expected = Array.isArray(item.correct) ? item.correct : [];
    return submitted.length === expected.length && submitted.every((v, i) => normalizeText(v) === normalizeText(expected[i]));
  }
  if (item.type === 'input') {
    const normalized = normalizeText(answer);
    const accepted = item.acceptedAnswers?.length ? item.acceptedAnswers : [item.correct];
    return accepted.some((candidate) => normalizeText(candidate) === normalized);
  }
  return false;
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s，。！？；：、“”‘’（）()]/g, '')
    .trim();
}

function itemInformation(theta, item) {
  const p = probabilityCorrect(theta, item);
  const a = Number(item.discrimination ?? 1);
  return a * a * p * (1 - p);
}

function countByGroup(answers, config) {
  const counts = { listening: 0, reading: 0, languageUse: 0 };
  for (const a of answers) {
    const group = groupForSkill(a.skill, config);
    counts[group] = (counts[group] || 0) + 1;
  }
  return counts;
}

function recentSameSkillPenalty(item, answers, config) {
  const n = config.maxConsecutiveSameSkill ?? 2;
  const recent = answers.slice(-n);
  if (recent.length < n) return 0;
  return recent.every((a) => a.skill === item.skill) ? -3.5 : 0;
}

function targetBoundary(theta, config) {
  return config.levelBoundaries.reduce((best, b) => Math.abs(theta - b) < Math.abs(theta - best) ? b : best, config.levelBoundaries[0]);
}

function routingCandidateScore(item, route, answers, config, rng) {
  const group = groupForSkill(item.skill, config);
  let score = 0;
  if (item.hskLevel === route.level) score += 5;
  score -= Math.abs(item.hskLevel - route.level) * 2;
  if (group === route.group) score += 4;
  score += recentSameSkillPenalty(item, answers, config);
  score += rng() * 0.35;
  return score;
}

function adaptiveCandidateScore(item, summary, answers, config, rng) {
  const counts = countByGroup(answers, config);
  const group = groupForSkill(item.skill, config);
  const minNeed = config.minimumGroupItems[group] ?? 0;
  const needBonus = counts[group] < minNeed ? 2.4 + (minNeed - counts[group]) * 0.18 : 0;
  const boundary = targetBoundary(summary.mean, config);
  const boundaryBonus = answers.length >= 18 ? Math.max(0, 1.2 - Math.abs(item.difficulty - boundary)) : 0;
  const information = itemInformation(summary.mean, item) * 5;
  const distancePenalty = Math.abs(item.difficulty - summary.mean) * 0.65;
  const typeCount = answers.filter((a) => a.type === item.type).length;
  const diversityBonus = typeCount < 3 ? 0.55 : 0;
  return information + needBonus + boundaryBonus + diversityBonus - distancePenalty + recentSameSkillPenalty(item, answers, config) + rng() * 0.28;
}

export function chooseNextItem(items, session, config, rng = Math.random) {
  const used = new Set(session.usedItemIds || []);
  const candidates = items.filter((item) => item.status === 'active' && item.placementEligible && !used.has(item.id));
  if (!candidates.length) return null;
  const summary = summarizePosterior(session.posterior, session.grid, config);
  const answers = session.answers || [];
  let scored;
  if (answers.length < config.routingItems) {
    const route = config.routingBlueprint[answers.length % config.routingBlueprint.length];
    scored = candidates.map((item) => ({ item, score: routingCandidateScore(item, route, answers, config, rng) }));
  } else {
    scored = candidates.map((item) => ({ item, score: adaptiveCandidateScore(item, summary, answers, config, rng) }));
  }
  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const nearBest = scored.filter(({ score }) => score >= bestScore - 0.22).slice(0, 4);
  return nearBest[Math.floor(rng() * nearBest.length)]?.item || scored[0].item;
}

function hasSkillCoverage(answers, config) {
  const counts = countByGroup(answers, config);
  return Object.entries(config.minimumGroupItems).every(([group, min]) => (counts[group] || 0) >= min);
}

function boundaryCoverage(answers, summary, config) {
  const boundary = targetBoundary(summary.mean, config);
  const near = answers.filter((a) => Math.abs(a.difficulty - boundary) <= 0.8);
  const sides = {
    low: near.filter((a) => a.difficulty <= boundary).length,
    high: near.filter((a) => a.difficulty > boundary).length
  };
  return near.length >= 5 && sides.low >= 2 && sides.high >= 2;
}

export function shouldStop(session, config) {
  const n = session.answers.length;
  if (n >= config.maxItems) return true;
  if (n < config.minItems) return false;
  const summary = summarizePosterior(session.posterior, session.grid, config);
  return summary.sd <= config.targetPosteriorSd && hasSkillCoverage(session.answers, config) && boundaryCoverage(session.answers, summary, config);
}

function skillPosterior(answers, group, overallMean, grid, config) {
  let posterior = createPrior(grid, overallMean, 0.95);
  const subset = answers.filter((a) => groupForSkill(a.skill, config) === group);
  for (const answer of subset) posterior = updatePosterior(posterior, grid, answer, answer.isCorrect);
  return summarizePosterior(posterior, grid, config);
}

function weightedAccuracy(answers, predicate) {
  const subset = answers.filter(predicate);
  if (!subset.length) return null;
  let good = 0;
  let total = 0;
  for (const a of subset) {
    const weight = 0.8 + Math.max(0, a.discrimination ?? 1) * 0.2;
    total += weight;
    if (a.isCorrect) good += weight;
  }
  return good / total;
}

function conservativeLevel(summary, answers, config) {
  const cumulativeAtLeast = (level) => summary.levelProbabilities.slice(level - 1).reduce((s, p) => s + p, 0);
  let level = 1;
  for (let candidate = 2; candidate <= 6; candidate += 1) {
    const floorAccuracy = weightedAccuracy(answers, (a) => a.hskLevel <= candidate - 1);
    const atLevelAccuracy = weightedAccuracy(answers, (a) => a.hskLevel === candidate);
    const evidence = cumulativeAtLeast(candidate) >= 0.62;
    const floorOK = floorAccuracy == null || floorAccuracy >= 0.58;
    const levelOK = atLevelAccuracy == null || atLevelAccuracy >= 0.38;
    if (evidence && floorOK && levelOK) level = candidate;
  }
  return Math.min(level, summary.modalLevel + 1);
}

function confidenceLabel(summary, answers, config) {
  const coverage = hasSkillCoverage(answers, config);
  if (coverage && summary.sd <= config.confidence.highSd && summary.topProbability >= config.confidence.highTopProbability) return 'high';
  if (coverage && summary.sd <= config.confidence.mediumSd && summary.topProbability >= config.confidence.mediumTopProbability) return 'medium';
  return 'low';
}

function estimatedRange(summary, finalLevel) {
  if (summary.sd <= 0.48 && summary.topProbability >= 0.58) return [finalLevel, finalLevel];
  const low = Math.max(1, finalLevel - (summary.sd > 0.85 ? 1 : 0));
  const high = Math.min(6, finalLevel + 1);
  return [low, high];
}

function skillLabel(level, overall) {
  if (level >= overall + 1) return 'strength';
  if (level <= overall - 1) return 'needsWork';
  return 'balanced';
}

export function buildResult(session, config) {
  const overall = summarizePosterior(session.posterior, session.grid, config);
  const finalLevel = conservativeLevel(overall, session.answers, config);
  const groups = {};
  for (const group of ['listening', 'reading', 'languageUse']) {
    const s = skillPosterior(session.answers, group, overall.mean, session.grid, config);
    const lvl = thetaToLevel(s.mean, config);
    groups[group] = {
      theta: round(s.mean),
      sd: round(s.sd),
      level: lvl,
      label: skillLabel(lvl, finalLevel),
      answered: session.answers.filter((a) => groupForSkill(a.skill, config) === group).length,
      accuracy: round(weightedAccuracy(session.answers, (a) => groupForSkill(a.skill, config) === group) ?? 0)
    };
  }
  const range = estimatedRange(overall, finalLevel);
  const confidence = confidenceLabel(overall, session.answers, config);
  const strengths = Object.entries(groups).filter(([, v]) => v.label === 'strength').map(([k]) => k);
  const needsWork = Object.entries(groups).filter(([, v]) => v.label === 'needsWork').map(([k]) => k);
  return {
    estimatedHskLevel: finalLevel,
    estimatedRange: range,
    confidence,
    theta: round(overall.mean),
    posteriorSd: round(overall.sd),
    levelProbabilities: overall.levelProbabilities.map(round),
    skills: groups,
    strengths,
    needsWork,
    answered: session.answers.length,
    correct: session.answers.filter((a) => a.isCorrect).length,
    completedAt: new Date().toISOString(),
    methodologyVersion: config.version,
    disclaimer: 'Kết quả ước tính nội bộ; không thay thế điểm hoặc chứng chỉ HSK chính thức.'
  };
}

function round(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

export function publicQuestion(item, optionOrder = null) {
  const payload = {
    id: item.id,
    hskLevelHidden: true,
    skill: item.skill,
    type: item.type,
    prompt: item.prompt,
    audioAvailable: Boolean(item.audio)
  };
  if (item.options) {
    const options = item.options.map((o) => ({ ...o }));
    if (optionOrder) options.sort((a, b) => optionOrder.indexOf(a.id) - optionOrder.indexOf(b.id));
    payload.options = options;
  }
  if (item.tokens) payload.tokens = [...item.tokens];
  return payload;
}
