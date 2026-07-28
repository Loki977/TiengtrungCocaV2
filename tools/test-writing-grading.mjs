import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createTokenItems, sanitizeTokenOrder, answerFromOrder, moveToken } from '../assets/js/thi-thu/reorder-board.js';
import { scoreExam } from '../assets/js/thi-thu/exam-engine.js';

const require = createRequire(import.meta.url);
const {
  AI_MAX_ATTEMPTS,
  RUBRIC_VERSION,
  aiFailurePatch,
  aiInputItems,
  aiSuccessPatch,
  canAiClaim,
  gradeWithGemini,
  gradingHash,
  manualGradePatch,
  rubricFor
} = require('../functions/writing-grading-core.js');

function geminiPayload(items, confidence = 0.9) {
  return {
    candidates:[{
      content:{
        parts:[{
          text:JSON.stringify({
            items:items.map(item => ({
              questionId:item.questionId,
              score:item.maxScore,
              maxScore:item.maxScore,
              confidence,
              criteria:{
                taskCompletion:20,
                content:20,
                grammar:20,
                vocabulary:15,
                coherence:15,
                characters:10
              },
              feedback:'Đạt yêu cầu.',
              suggestedAnswer:'这是一个合适的答案。'
            }))
          })
        }]
      }
    }],
    usageMetadata:{ promptTokenCount:120, candidatesTokenCount:80, totalTokenCount:200 }
  };
}

function response(payload, ok = true, status = 200) {
  return { ok, status, async json(){ return payload; } };
}

// Duplicate token text must remain two independent, stable items.
const duplicateItems = createTokenItems('q-duplicate', ['很', '好', '很']);
assert.equal(new Set(duplicateItems.map(item => item.id)).size, 3);
let order = [];
order = moveToken(order, duplicateItems[0].id);
order = moveToken(order, duplicateItems[2].id);
assert.equal(answerFromOrder(duplicateItems, order), '很很');
order = moveToken(order, duplicateItems[1].id, { targetId:duplicateItems[2].id });
assert.equal(answerFromOrder(duplicateItems, order), '很好很');
order = moveToken(order, duplicateItems[2].id, { zone:'bank' });
assert.equal(answerFromOrder(duplicateItems, order), '很好');
assert.deepEqual(
  sanitizeTokenOrder(duplicateItems, [duplicateItems[0].id, duplicateItems[0].id, 'forged']),
  [duplicateItems[0].id]
);

// HSK 4 short writing is subjective: answered work is pending; blank work is an immediate zero.
const shortQuestion = {
  id:'w011',
  sectionId:'writing',
  sectionTitle:'Viết',
  questionType:'short_writing',
  scoreWeight:10,
  requiredWords:['建议']
};
const exam = { totalPoints:300, passPoints:180 };
const answeredScore = scoreExam(exam, [shortQuestion], { answers:{} }, { w011:'我建议你早点休息。' });
assert.equal(answeredScore.pendingWritingMax, 10);
assert.equal(answeredScore.objectiveMax, 0);
assert.equal(answeredScore.finalStatus, 'pending_writing');
const blankScore = scoreExam(exam, [shortQuestion], { answers:{} }, {});
assert.equal(blankScore.pendingWritingMax, 0);
assert.equal(blankScore.objectiveMax, 10);
assert.equal(blankScore.objectiveEarned, 0);

const eligibleAt = Date.now() - 1;
const baseSubmission = {
  status:'pending_manual',
  maxScore:10,
  aiAttempts:0,
  aiEligibleAtMillis:eligibleAt,
  retryAtMillis:eligibleAt
};
assert.equal(canAiClaim(baseSubmission), true);
assert.equal(canAiClaim({ ...baseSubmission, aiEligibleAtMillis:Date.now() + 10_000, retryAtMillis:Date.now() + 10_000 }), false);

// Atomic claim + teacher-wins rule.
const claimed = { ...baseSubmission, status:'ai_grading', aiClaimToken:'claim-1', aiAttempts:1 };
const manual = { ...claimed, ...manualGradePatch(claimed, { score:8.5, feedback:'Tốt', gradedBy:'teacher-1' }) };
assert.equal(manual.status, 'graded_manual');
assert.equal(manual.aiClaimToken, null);
assert.equal(aiSuccessPatch(manual, 'claim-1', { score:9 }), null);

// A valid AI claim may be applied only once.
const aiResult = {
  score:7.5,
  confidence:.88,
  criteria:{ taskCompletion:15, content:15, grammar:15, vocabulary:10, coherence:10, characters:10 },
  feedback:'Cần sửa ngữ pháp.',
  suggestedAnswer:'建议这样写。'
};
const firstAiPatch = aiSuccessPatch(claimed, 'claim-1', aiResult);
assert.equal(firstAiPatch.status, 'graded_ai');
assert.equal(aiSuccessPatch({ ...claimed, ...firstAiPatch }, 'claim-1', aiResult), null);

// Retry uses backoff and stops after the configured maximum.
const retryPatch = aiFailurePatch(claimed, 'claim-1', 'gemini_timeout', Date.now());
assert.equal(retryPatch.status, 'pending_manual');
assert.ok(retryPatch.retryAtMillis > Date.now());
const exhausted = aiFailurePatch({ ...claimed, aiAttempts:AI_MAX_ATTEMPTS }, 'claim-1', 'gemini_timeout', Date.now());
assert.equal(exhausted.aiRetryExhausted, true);
assert.equal(exhausted.retryAtMillis, null);

const batchItems = [
  {
    questionId:'w009',
    hskLevel:'HSK 5',
    questionType:'long_writing',
    maxScore:10,
    prompt:'Dùng tất cả từ cho trước để viết đoạn văn khoảng 80 chữ.',
    requiredWords:['计划', '坚持'],
    answer:'我制定了一个学习计划，并且每天坚持复习。',
    rubric:rubricFor('long_writing', 'HSK 5'),
    userId:'must-not-leak',
    email:'must-not-leak@example.com',
    attemptId:'must-not-leak'
  },
  {
    questionId:'w001',
    hskLevel:'HSK 6',
    questionType:'summary_writing',
    maxScore:100,
    prompt:'Tóm tắt tài liệu bằng khoảng 400 chữ.',
    requiredWords:[],
    answer:'文章主要介绍了学习方法和坚持的重要性。'.repeat(40),
    rubric:rubricFor('summary_writing', 'HSK 6')
  }
];
const minimized = aiInputItems(batchItems);
const serialized = JSON.stringify(minimized);
assert.ok(!serialized.includes('must-not-leak'));
assert.deepEqual(Object.keys(minimized[0]).sort(), ['answer', 'hskLevel', 'maxScore', 'prompt', 'questionId', 'questionType', 'requiredWords', 'rubric'].sort());
assert.ok(serialized.length < 20_000, 'AI payload must remain bounded for an HSK 5/6 batch.');

let apiCalls = 0;
const graded = await gradeWithGemini(batchItems, {
  apiKey:'test-key',
  fetchImpl:async () => {
    apiCalls += 1;
    return response(geminiPayload(batchItems));
  }
});
assert.equal(apiCalls, 1);
assert.equal(graded.items.length, 2);

let recheckCalls = 0;
await gradeWithGemini(batchItems.slice(0, 1), {
  apiKey:'test-key',
  fetchImpl:async () => {
    recheckCalls += 1;
    return response(geminiPayload(batchItems.slice(0, 1), recheckCalls === 1 ? .4 : .92));
  }
});
assert.equal(recheckCalls, 2);

assert.equal(gradingHash({ questionId:'q1', answer:'答案', rubricVersion:RUBRIC_VERSION }),
  gradingHash({ questionId:'q1', answer:'答案', rubricVersion:RUBRIC_VERSION }));
assert.notEqual(gradingHash({ questionId:'q1', answer:'答案', rubricVersion:RUBRIC_VERSION }),
  gradingHash({ questionId:'q1', answer:'答案。', rubricVersion:RUBRIC_VERSION }));

console.log('Writing grading tests passed: reorder, subjective scoring, claims, retry, privacy, batching and AI recheck.');
