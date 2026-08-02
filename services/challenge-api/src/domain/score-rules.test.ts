import { computeScoreDeltas } from './score-rules';

/** 델타 배열을 { userId: {cheer, thank} } 맵으로 (검증 편의) */
function asMap(deltas: ReturnType<typeof computeScoreDeltas>) {
  const m: Record<string, { cheer: number; thank: number }> = {};
  for (const d of deltas) m[d.userId] = { cheer: d.cheerScore, thank: d.thankScore };
  return m;
}

describe('computeScoreDeltas — docs/cheer-thank-system.md 시나리오', () => {
  // 2인 그룹, 서로 다른 목표시간. A 06:30(early), B 07:30(early).
  // 처리 순서: A 완료 이벤트, 그 다음 B 완료 이벤트.
  it('2인 일반 케이스: A cheer+3/thank+1, B cheer+2/thank+2', () => {
    // A 완료 시점: 완료=[A], 조기=[A], 미완료=B
    const atA = asMap(
      computeScoreDeltas({
        completerId: 'A',
        creatorId: null,
        activeUserIds: ['A', 'B'],
        completedUserIds: new Set(['A']),
        earlyCompletedUserIds: new Set(['A']),
      }),
    );
    // B 완료 시점: 완료=[A,B], 조기=[A,B], 미완료=없음 → 전원완료
    const atB = asMap(
      computeScoreDeltas({
        completerId: 'B',
        creatorId: null,
        activeUserIds: ['A', 'B'],
        completedUserIds: new Set(['A', 'B']),
        earlyCompletedUserIds: new Set(['A', 'B']),
      }),
    );

    // 합산
    const A = { cheer: (atA.A?.cheer ?? 0) + (atB.A?.cheer ?? 0), thank: (atA.A?.thank ?? 0) + (atB.A?.thank ?? 0) };
    const B = { cheer: (atA.B?.cheer ?? 0) + (atB.B?.cheer ?? 0), thank: (atA.B?.thank ?? 0) + (atB.B?.thank ?? 0) };

    expect(A).toEqual({ cheer: 3, thank: 1 });
    expect(B).toEqual({ cheer: 2, thank: 2 });
  });

  it('creator ×10 (A가 리더): A cheerScore 30, B cheer 2 / thank 2 / A thank 1', () => {
    const atA = asMap(
      computeScoreDeltas({
        completerId: 'A',
        creatorId: 'A',
        activeUserIds: ['A', 'B'],
        completedUserIds: new Set(['A']),
        earlyCompletedUserIds: new Set(['A']),
      }),
    );
    const atB = asMap(
      computeScoreDeltas({
        completerId: 'B',
        creatorId: 'A',
        activeUserIds: ['A', 'B'],
        completedUserIds: new Set(['A', 'B']),
        earlyCompletedUserIds: new Set(['A', 'B']),
      }),
    );
    const A = { cheer: (atA.A?.cheer ?? 0) + (atB.A?.cheer ?? 0), thank: (atA.A?.thank ?? 0) + (atB.A?.thank ?? 0) };
    const B = { cheer: (atA.B?.cheer ?? 0) + (atB.B?.cheer ?? 0), thank: (atA.B?.thank ?? 0) + (atB.B?.thank ?? 0) };

    expect(A).toEqual({ cheer: 30, thank: 1 }); // 10(즉시) + 20(보너스)
    expect(B).toEqual({ cheer: 2, thank: 2 });
  });

  it('목표시간 이후 완료(delta<=0, 조기 아님)는 점수 없음', () => {
    // A가 조기 아님으로 완료 (early 집합에 없음), 미완료 B 존재
    const deltas = computeScoreDeltas({
      completerId: 'A',
      creatorId: null,
      activeUserIds: ['A', 'B'],
      completedUserIds: new Set(['A']),
      earlyCompletedUserIds: new Set(), // 아무도 조기 아님
    });
    expect(deltas).toEqual([]);
  });

  it('1인 그룹 조기완료: 전원완료 보너스만 (자신 +1/+1)', () => {
    const deltas = asMap(
      computeScoreDeltas({
        completerId: 'A',
        creatorId: null,
        activeUserIds: ['A'],
        completedUserIds: new Set(['A']),
        earlyCompletedUserIds: new Set(['A']),
      }),
    );
    expect(deltas.A).toEqual({ cheer: 1, thank: 1 });
  });

  it('분기 C: 늦게 완료해도(조기 아님) 먼저 조기완료한 팀원에게 감사 적립', () => {
    // A 조기완료(이전), B가 지금 늦게 완료 → A에게 thank +1, B는 조기 아니라 A/B 보너스 없음
    const deltas = asMap(
      computeScoreDeltas({
        completerId: 'B',
        creatorId: null,
        activeUserIds: ['A', 'B'],
        completedUserIds: new Set(['A', 'B']),
        earlyCompletedUserIds: new Set(['A']), // A만 조기
      }),
    );
    expect(deltas.A).toEqual({ cheer: 0, thank: 1 });
    expect(deltas.B).toBeUndefined(); // B 증분 없음
  });
});
