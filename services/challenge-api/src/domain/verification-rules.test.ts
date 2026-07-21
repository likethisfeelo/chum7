import {
  createDayCompletionRules,
  evaluateSubmission,
  inferVerificationType,
  resolveQuestType,
  resolveVerificationType,
} from './verification-rules';
import type { ProgressRecord } from './progress';

// ── test/backend/verification-submit-infer-type.test.ts 이식 ────────────────

describe('verification submit inferVerificationType', () => {
  test('prefers explicit verificationType', () => {
    const inferred = inferVerificationType({
      userChallengeId: '550e8400-e29b-41d4-a716-446655440000',
      day: 1,
      verificationType: 'link',
      imageUrl: 'https://example.com/image.jpg',
    } as any);

    expect(inferred).toBe('link');
  });

  test('falls back in priority order link > video > image > text', () => {
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1, linkUrl: 'https://a.com' } as any)).toBe('link');
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1, videoUrl: 'https://a.com/v.mp4' } as any)).toBe('video');
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1, imageUrl: 'https://a.com/i.jpg' } as any)).toBe('image');
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1 } as any)).toBe('text');
  });

  test('ignores blank string media fields when inferring', () => {
    expect(inferVerificationType({ linkUrl: '   ' } as any)).toBe('text');
    expect(inferVerificationType({ videoUrl: '   ', imageUrl: ' https://a.com/i.jpg ' } as any)).toBe('image');
  });

  test('ignores invalid explicit verificationType values and falls back', () => {
    expect(inferVerificationType({ verificationType: 'unknown', imageUrl: 'https://a.com/i.jpg' } as any)).toBe('image');
    expect(inferVerificationType({ verificationType: '   ', videoUrl: 'https://a.com/v.mp4' } as any)).toBe('video');
  });
});

// ── test/backend/verification-normalization.test.ts 이식 ────────────────────

describe('verification normalization resolveVerificationType', () => {
  test('uses valid explicit type first', () => {
    expect(resolveVerificationType({ verificationType: 'video', imageUrl: 'https://a.com/i.jpg' })).toBe('video');
  });

  test('falls back when explicit type is invalid/blank', () => {
    expect(resolveVerificationType({ verificationType: 'unknown', linkUrl: 'https://a.com' })).toBe('link');
    expect(resolveVerificationType({ verificationType: '   ', videoUrl: 'https://a.com/v.mp4' })).toBe('video');
  });

  test('detects legacy video when imageUrl is actually video extension', () => {
    expect(resolveVerificationType({ imageUrl: 'https://a.com/upload/abc.mp4' })).toBe('video');
  });

  test('defaults to text when no usable media fields', () => {
    expect(resolveVerificationType({ imageUrl: '   ', videoUrl: '', linkUrl: null })).toBe('text');
  });
});

// ── challengeType 기반 하루 완료/isExtra 판정 (docs/core-specs/01) ──────────

function dp(partial: Partial<ProgressRecord>): ProgressRecord {
  return { day: 1, status: null, score: 0, remedied: false, ...partial };
}

describe('day completion rules (challengeType)', () => {
  const leaderQuests = ['q1', 'q2'];

  test('leader_only: all leader quests done completes the day', () => {
    const ctx = { challengeType: 'leader_only', totalLeaderQuestIds: leaderQuests, leaderQuestsFetched: true };
    const rules = createDayCompletionRules(ctx);
    expect(rules.isDayComplete(dp({ leaderQuestIds: ['q1'] }))).toBe(false);
    expect(rules.isDayComplete(dp({ leaderQuestIds: ['q1', 'q2'] }))).toBe(true);
  });

  test('personal_only: personal quest done completes the day', () => {
    const ctx = { challengeType: 'personal_only', totalLeaderQuestIds: [], leaderQuestsFetched: true };
    const rules = createDayCompletionRules(ctx);
    expect(rules.isDayComplete(dp({ personalQuestDone: true }))).toBe(true);
    expect(rules.isDayComplete(dp({}))).toBe(false);
  });

  test('leader_personal (mixed): both leader AND personal required', () => {
    const ctx = { challengeType: 'leader_personal', totalLeaderQuestIds: ['q1'], leaderQuestsFetched: true };
    const rules = createDayCompletionRules(ctx);
    expect(rules.isDayComplete(dp({ leaderQuestIds: ['q1'] }))).toBe(false);
    expect(rules.isDayComplete(dp({ personalQuestDone: true }))).toBe(false);
    expect(rules.isDayComplete(dp({ leaderQuestIds: ['q1'], personalQuestDone: true }))).toBe(true);
  });

  test('mixed is treated the same as leader_personal', () => {
    const ctx = { challengeType: 'mixed', totalLeaderQuestIds: ['q1'], leaderQuestsFetched: true };
    const rules = createDayCompletionRules(ctx);
    expect(rules.isMixedType).toBe(true);
    expect(rules.isDayComplete(dp({ leaderQuestIds: ['q1'], personalQuestDone: true }))).toBe(true);
  });

  test('legacy fallback: quests not fetched → boolean leaderQuestDone flag', () => {
    const ctx = { challengeType: 'leader_only', totalLeaderQuestIds: [], leaderQuestsFetched: false };
    const rules = createDayCompletionRules(ctx);
    expect(rules.isDayComplete(dp({ leaderQuestDone: true }))).toBe(true);
    expect(rules.isDayComplete(dp({}))).toBe(false);
  });
});

describe('evaluateSubmission (혼합형 partial flow + isExtra)', () => {
  const ctx = { challengeType: 'leader_personal', totalLeaderQuestIds: ['q1'], leaderQuestsFetched: true };
  const rules = createDayCompletionRules(ctx);

  test('first leader submission on mixed → partial (isDayComplete=false), not extra', () => {
    const out = evaluateSubmission(rules, ctx, undefined, 'leader', 'q1');
    expect(out.isExtra).toBe(false);
    expect(out.dayNowComplete).toBe(false);
    expect(out.leaderQuestDone).toBe(true);
    expect(out.personalQuestDone).toBeUndefined();
  });

  test('second (personal) submission completes the mixed day', () => {
    const existing = dp({ status: 'partial', leaderQuestIds: ['q1'], leaderQuestDone: true });
    const out = evaluateSubmission(rules, ctx, existing, 'personal');
    expect(out.isExtra).toBe(false);
    expect(out.dayNowComplete).toBe(true);
    expect(out.personalQuestDone).toBe(true);
  });

  test('same questType twice on mixed → isExtra', () => {
    const existing = dp({ status: 'partial', leaderQuestIds: ['q1'], leaderQuestDone: true });
    const out = evaluateSubmission(rules, ctx, existing, 'leader', 'q1');
    expect(out.isExtra).toBe(true);
  });

  test('submission after day already complete → isExtra', () => {
    const existing = dp({ status: 'success', leaderQuestIds: ['q1'], leaderQuestDone: true, personalQuestDone: true });
    const out = evaluateSubmission(rules, ctx, existing, 'personal');
    expect(out.isExtra).toBe(true);
  });

  test('personal_only completes with a single personal submission', () => {
    const pCtx = { challengeType: 'personal_only', totalLeaderQuestIds: [], leaderQuestsFetched: true };
    const pRules = createDayCompletionRules(pCtx);
    const out = evaluateSubmission(pRules, pCtx, undefined, 'personal');
    expect(out.dayNowComplete).toBe(true);
  });
});

describe('resolveQuestType defaults', () => {
  test('explicit request wins', () => {
    expect(resolveQuestType('leader_only', 'personal')).toBe('personal');
  });
  test('challengeType-based defaults (mixed stays null)', () => {
    expect(resolveQuestType('leader_only', null)).toBe('leader');
    expect(resolveQuestType('personal_only', null)).toBe('personal');
    expect(resolveQuestType('leader_personal', null)).toBeNull();
    expect(resolveQuestType('mixed', null)).toBeNull();
  });
});
