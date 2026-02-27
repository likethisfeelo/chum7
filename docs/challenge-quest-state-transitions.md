# CHME Challenge-Quest 상태전이표 (Phase 0)

## Layer B 개인 퀘스트 상태전이

| 현재 상태 | 이벤트 | 조건 | 다음 상태 | 비고 |
|---|---|---|---|---|
| pending | AUTO_APPROVE | `personalQuestAutoApprove=true` | approved | 즉시 승인 |
| pending | APPROVE | 리뷰 권한 보유자 승인 | approved | 관리자/보조승인자 가능 |
| pending | REJECT | 리뷰 권한 보유자 반려 + feedback>=10자 | rejected | 반려 사유 필수 |
| rejected | RESUBMIT | `revisionCount < 2` + D-1 23:59 이전 | revision_pending | 재심사 대기 |
| revision_pending | APPROVE | 리뷰 권한 보유자 승인 | approved | 정상 승인 |
| revision_pending | REJECT | `revisionCount + 1 < 2` | rejected | 재반려 가능 |
| revision_pending | REJECT_LIMIT_EXCEEDED | `revisionCount + 1 >= 2` | expired | 수정 기회 소진 |
| pending/rejected/revision_pending | DEADLINE_EXPIRED | 챌린지 시작 D-day 00:00 도달 | expired | 미승인 자동 만료 |
| approved | REVERT_SAME_DAY | 승인 당일 + 정정 권한 보유자 | rejected/pending | 운영 정정(취소/재판단) |
| rejected | REAPPROVE_SAME_DAY | 반려 당일 + 정정 권한 보유자 | approved | 운영 정정 |

## 승인 운영 모드 상태전이

| 항목 | 이벤트 | 전이 |
|---|---|---|
| approvalMode | SET_MANUAL | auto -> manual |
| approvalMode | SET_AUTO | manual -> auto |
| reviewerAssignment | ASSIGN_HELPER | helper 없음 -> helper 있음 |
| reviewerAssignment | UNASSIGN_HELPER | helper 있음 -> helper 없음 |

## Verification 핵심 상태 규칙

| 검증 대상 | 규칙 |
|---|---|
| practiceAt | `uploadAt - 4h <= practiceAt <= uploadAt` |
| certDate/day | 저장은 UTC, day 판단은 사용자 로컬 타임존 경계(00:00~23:59:59) |
| duplicate verification | 첫 인증 이후 동일 `day + questId`는 차단하지 않고 `isExtra=true` |
| remedy 시도 | Day 6에만 허용, 정책/실패일/maxRemedyDays/endDay 순차 검증 |

## 감사로그 필수 이벤트

- 승인모드 변경(auto/manual)
- 보조승인자 지정/해제
- 승인/반려/재승인/당일 정정(취소 포함)
- 누가/언제/대상 questId/사유(feedback 포함) 기록
