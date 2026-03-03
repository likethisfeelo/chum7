# Join Wizard QA 테스트 케이스

## 범위
- 대상 화면: `ChallengeDetailPage` + `JoinWizardBottomSheet`
- 대상 정책:
  - step resolver (`time → quest? → confirm`)
  - quest 필수/선택 유효성
  - KST 기준 계산 + 로컬 타임존 노출

## 공통 사전조건
- 사용자 로그인 상태
- 챌린지 상태(`lifecycle`)가 `recruiting`
- 참여 이력 없음 (`alreadyJoined=false`)
- 참여 버튼 클릭 시 바텀시트 오픈 가능

## 테스트 케이스 표

| ID | 시나리오 | 입력/조건 | 수행 절차 | 기대 결과 |
|---|---|---|---|---|
| JW-001 | leader_only + 개인퀘스트 비활성 | `challengeType=leader_only`, `personalQuestEnabled=false` | 참여 버튼 클릭 → 다음 | step 순서가 `time → confirm`으로만 구성됨 |
| JW-002 | personal_only + 개인퀘스트 활성(필수) | `challengeType=personal_only`, `personalQuestEnabled=true` | 참여 버튼 클릭 → quest step 진입 | quest step에 스킵 버튼이 노출되지 않음 |
| JW-003 | leader_personal + 개인퀘스트 활성(선택) | `challengeType=leader_personal`, `personalQuestEnabled=true` | quest step 진입 | quest step에 스킵 버튼 노출 |
| JW-004 | mixed + 개인퀘스트 활성(선택) | `challengeType=mixed`, `personalQuestEnabled=true` | quest step 진입 | quest step이 선택 모드 문구로 노출 |
| JW-005 | quest 필수 모드 제목 누락 | personal_only, `questTitle=''`, `questDescription='설명 있음'` | 다음 클릭 | 토스트: `퀘스트 제목을 입력해주세요` |
| JW-006 | quest 필수 모드 설명 누락 | personal_only, `questTitle='제목 있음'`, `questDescription=''` | 다음 클릭 | 토스트: `퀘스트 설명을 입력해주세요` |
| JW-007 | quest 선택 모드 부분 입력(제목만) | leader_personal/mixed, `questTitle='제목'`, `questDescription=''` | 다음 클릭 | 토스트: `퀘스트 설명을 입력해주세요` |
| JW-008 | quest 선택 모드 부분 입력(설명만) | leader_personal/mixed, `questTitle=''`, `questDescription='설명'` | 다음 클릭 | 토스트: `퀘스트 제목을 입력해주세요` |
| JW-009 | quest 선택 모드 완전 스킵 | leader_personal/mixed, 제목/설명 모두 공백 | 건너뛰기 클릭 | confirm에서 개인 퀘스트 블록 미노출 |
| JW-010 | time 기본값(챌린지 목표시간 반영) | `targetTime='07:00'` 또는 유효 HH:mm | 위자드 오픈 | time step 초기값이 챌린지 목표시간 기준으로 설정됨 |
| JW-011 | time 기본값 fallback | `targetTime` 누락 또는 파싱불가 | 위자드 오픈 | time step 초기값 `오전 7시 00분` |
| JW-012 | 위자드 재오픈 초기화 | 한 번 입력 후 닫기 → 재오픈 | 재오픈 시 step 1부터 확인 | step index/quest 입력값/인증방식이 초기화됨 |
| JW-013 | time step 시간대 라벨 | 사용자 로컬 타임존 존재 | time step 확인 | `표시 시간대: {userTimezone}` 노출 |
| JW-014 | manual review 안내 문구(시작일 없음) | `personalQuestAutoApprove=false`, 시작일 필드 없음 | quest step 확인 | fallback 문구: `챌린지 시작 D-1 23:59... 기준 KST` 노출 |
| JW-015 | manual review 안내 문구(시작일 있음) | `startAt` 또는 `challengeStartAt` 제공 | quest step 확인 | `내 시간 YYYY.MM.DD HH:mm, 기준 KST` 형식 노출 |
| JW-016 | 모집 마감 로컬 포맷 | `recruitEndAt` 또는 `recruitEndDate` 유효 | confirm step 확인 | `모집 마감`이 로컬 시간 포맷 + `(내 시간)`으로 노출 |
| JW-017 | 모집 마감 파싱 실패 내구성 | 마감 필드가 invalid date 문자열 | confirm step 확인 | 마감 영역이 노출되지 않고 UI 오류 없음 |
| JW-018 | auto approve 문구 | `personalQuestAutoApprove=true` | quest step 확인 | `✓ 등록 즉시 자동 승인됩니다` 노출 |
| JW-019 | join API payload 검증 | time/quest 입력 후 제출 | 네트워크 탭 확인 | `POST /challenges/{id}/join` body가 `personalTarget`만 포함 |
| JW-020 | personal quest 후속 제출 조건 | quest 제목/설명 모두 입력 vs 미입력 | 제출 후 네트워크 탭 확인 | 둘 다 입력 시에만 `POST /personal-quest` 호출 |
| JW-021 | CTA 비활성 조건(이미 참여) | `alreadyJoined=true` | 상세 화면 확인 | 참여 버튼 disabled + 안내문 노출 |
| JW-022 | CTA 비활성 조건(모집 아님) | `lifecycle!=recruiting` | 상세 화면 확인 | 참여 버튼 disabled |
| JW-023 | 이전/다음 네비게이션 | 다단계 위자드 | 이전/다음 반복 클릭 | step 이동이 정상 동작하고 index/progress 일치 |
| JW-024 | 제출 성공 후 동작 | join 성공 응답 | 제출 클릭 | 성공 토스트 + my-challenges invalidate + `/me` 이동 |
| JW-025 | 제출 실패 처리 | join API 에러 응답 | 제출 클릭 | 에러 토스트 노출, 위자드 유지 |

## 회귀 체크 포인트
- `goal` step / `personalGoal` 입력 UI가 참여 플로우에 재등장하지 않는지 확인
- `resolveWizardSteps()` 분기 외 추가 하드코딩 분기가 유입되지 않는지 확인
- 시간/마감 표시 문자열이 raw backend 문자열로 노출되지 않는지 확인

## 권장 실행 순서
1. 스텝 분기/유효성 케이스(JW-001~009)
2. 시간/타임존 케이스(JW-010~017)
3. API 연동/제출 케이스(JW-019~025)
4. 회귀 체크 포인트 점검
