# 챌린지 참여자 유저 플로우 유형 정리

- 범위: 참여자(유저) 관점 챌린지-퀘스트-레메디 전체 플로우
- 작성 기준: ADR-0001, challenge-quest-state-transitions.md, 코드베이스 실구현 기반

---

## 1. 핵심 규칙 요약

| 항목 | 규칙 |
|------|------|
| 참여 가능 시점 | `recruiting` 상태에서만 신청 가능 |
| 라이프사이클 | `draft → recruiting → preparing → active → completed` (EventBridge 자동 전환) |
| 일일 인증 시간 검증 | `practiceAt` 기준 4시간 이내 업로드 |
| day 정합성 | 유저 로컬 타임존 경계(00:00~23:59:59) 기준, ±1 허용 |
| extra 인증 | 이미 성공한 day 재인증 → `isExtra=true`, 0점 기록 |
| 레메디(보완) 시점 | **Day 6에만** 허용 |
| 레메디 대상 | 실패한 Day 1~5 (정책 허용 범위 내) |
| 레메디 점수 | base 10점 × 0.7 = **7점** |
| 개인 퀘스트 제안 마감 | 챌린지 시작 D-1 23:59(KST) |
| 개인 퀘스트 최대 리젝 | 2회 초과 시 `expired`, `disqualified` 처리 |
| 완주 조건 | 성공한 날(레메디 포함) = 7 |

---

## 2. 참여자 관점 경우의 수 (4개 축)

### 축 1. 챌린지 타입 (challengeType)

| 타입 | 퀘스트 구성 | personalGoal | personalTarget |
|------|------------|--------------|----------------|
| `leader_only` | 공통(리더) 퀘스트만 | 불필요 | 기본 불필요 |
| `personal_only` | 개인 퀘스트 중심 | 필수 | 필수 |
| `leader_personal` | 공통 + 개인 퀘스트 | 선택 | 필수 |
| `mixed` | A/B/D 레이어 전체 | 필수 | 필수 |

### 축 2. 개인 퀘스트 운영 모드 (personalQuestEnabled=true 챌린지)

| 모드 | 조건 | 상태 흐름 | 특징 |
|------|------|-----------|------|
| 자동 승인 | `personalQuestAutoApprove=true` | 제출 즉시 `approved` | 즉시 활동 시작 가능 |
| 리더 승인 | `personalQuestAutoApprove=false` | `pending → approved/rejected → revision_pending` | 최대 2회 재심사 루프 |

### 축 3. 레메디 정책 (remedyPolicy)

| 정책 | 최대 레메디 일수 | 점수 | 비고 |
|------|----------------|------|------|
| `strict` | 0일 | 불가 | 완벽 완주 강제 |
| `limited` | 1~2일 (maxRemedyDays) | 7점 | 소수 실수 허용 |
| `open` | 최대 5일 | 7점 | 유연한 완주 지원 |

### 축 4. 레이어 구조 (mixed 타입)

| 레이어 | 퀘스트 주체 | 승인 방식 |
|--------|------------|---------|
| A 레이어 | 공통 퀘스트 (전체 참여자) | 자동 |
| B 레이어 | 리더 확장 퀘스트 | 자동 기본, 수동 전환 가능 |
| D 레이어 | 참여자 제안 개인 퀘스트 | 자동 or 리더 심사 |

---

## 3. 대표 참여자 시나리오 5가지

### 시나리오 1 — 엄격 완주형 (`leader_only` + `strict`)

**예시 챌린지**: 아침 7시 기상 인증 챌린지

**특징**
- 리더가 만든 공통 퀘스트만 수행
- 실패 허용 없음 (레메디 불가)
- 개인 목표/목표시각 입력 불필요
- 가장 높은 긴장감, 완주 시 달성감 극대화

**참여자 흐름 개요**
- Join → (preparing 대기) → active 전환 → 매일 리더 퀘스트 인증 → 7일 완주 or 실패

#### 7일 플로우

| Day | 행동 | API | 결과 | 누적 점수 |
|-----|------|-----|------|---------|
| D1 | 기상 후 인증 업로드 (목표보다 10분 일찍) | `POST /verifications` | +10pt, delta=+10 | 10 |
| D2 | 기상 후 인증 업로드 (정시) | `POST /verifications` | +10pt, delta=0 | 20 |
| D3 | 늦잠 → 인증 미제출 | - | 0pt, progress[D3]=null | 20 |
| D4 | 인증 업로드 (목표보다 5분 일찍) | `POST /verifications` | +10pt | 30 |
| D5 | 인증 업로드 (정시) | `POST /verifications` | +10pt | 40 |
| D6 | 인증 업로드 + **레메디 시도** | `POST /verifications`, `POST /verifications/remedy` | 인증 +10pt / **레메디 불가(strict)** | 50 |
| D7 | 마지막 인증 업로드 | `POST /verifications` | +10pt | 60 |

**결과**: 성공 6/7일 → **실패(failed)** (strict 정책, 레메디 없음)

> 완주 달성 조건: 7일 연속 인증 필요

---

### 시나리오 2 — 리더 가이드형 (`leader_only` + `limited`)

**예시 챌린지**: 매일 30분 영어 학습 챌린지

**특징**
- 공통 퀘스트 기반, 소수의 실수(1~2일) 허용
- 레메디로 실패일 만회 가능
- 가장 일반적인 그룹 챌린지 형태

#### 7일 플로우

| Day | 행동 | API | 결과 | 누적 점수 |
|-----|------|-----|------|---------|
| D1 | 학습 후 인증 | `POST /verifications` | +10pt, 연속 1일 | 10 |
| D2 | 학습 후 인증 | `POST /verifications` | +10pt, 연속 2일 | 20 |
| D3 | 개인 사정으로 누락 | - | 0pt, 연속일 초기화 | 20 |
| D4 | 학습 후 인증 | `POST /verifications` | +10pt | 30 |
| D5 | 학습 후 인증 | `POST /verifications` | +10pt | 40 |
| D6 | 인증 + **D3 레메디** | `POST /verifications` + `POST /verifications/remedy` | +10pt +7pt | 57 |
| D7 | 마지막 인증 | `POST /verifications` | +10pt | 67 |

**결과**: 성공 7/7일(레메디 포함) → **완주(completed)**

---

### 시나리오 3 — 자기설계 자유형 (`personal_only` + 자동 승인 + `open`)

**예시 챌린지**: 나만의 30분 독서 루틴 챌린지

**특징**
- 참여 시 개인 목표(`personalGoal`)와 목표시각(`personalTarget`) 직접 설정
- 개인 퀘스트 제안 즉시 자동 승인
- 최대 5일 레메디 허용 (가장 유연)
- 자기주도적 참여자에게 적합

**개인 퀘스트 제안 흐름 (recruiting/preparing 기간)**

```
참여자 신청 (POST /challenges/{id}/join)
  → 개인 퀘스트 제안 제출 (POST /challenges/{id}/personal-quest)
    → personalQuestAutoApprove=true → 즉시 approved
      → active 전환 후 개인 퀘스트 기준으로 인증
```

#### 7일 플로우

| Day | 행동 | API | 결과 | 누적 점수 |
|-----|------|-----|------|---------|
| D1 | 독서 후 인증 (목표 20:00, 실제 19:45) | `POST /verifications` | +10pt, delta=+15 | 10 |
| D2 | 독서 후 인증 (정시) | `POST /verifications` | +10pt | 20 |
| D3 | 누락 | - | 0pt | 20 |
| D4 | 누락 | - | 0pt | 20 |
| D5 | 인증 (목표보다 30분 일찍) | `POST /verifications` | +10pt, 응원권 발급 | 30 |
| D6 | 인증 + **D3, D4 레메디** (open, max 5일 허용) | `POST /verifications` + `POST /verifications/remedy` × 2 | +10pt +7pt +7pt | 54 |
| D7 | 마지막 인증 | `POST /verifications` | +10pt | 64 |

**결과**: 성공 7/7일(레메디 포함) → **완주(completed)**

---

### 시나리오 4 — 구조적 병행형 (`leader_personal` + 리더 승인 + `limited`)

**예시 챌린지**: 운동(공통) + 개인 목표(식단/스트레칭) 혼합 챌린지

**특징**
- 공통 퀘스트(리더 설계) + 개인 퀘스트 병행
- 리더 심사 루프 존재 (pending → approved/rejected → revision_pending)
- 제한적 레메디 허용

**개인 퀘스트 제안 흐름 (리더 승인 모드)**

```
참여자 신청
  → 개인 퀘스트 제안 제출 (POST /challenges/{id}/personal-quest)
    → status: pending (리더 검토 대기)
    → 리더 반려 → status: rejected
      → 수정 재제출 (PATCH /challenges/{id}/personal-quest/{proposalId})
        → status: revision_pending → 리더 재검토
          → 승인: status: approved
          → 2회 반려 시: status: expired → disqualified
```

**개인 퀘스트 상태 전이**

| 상태 | 의미 | 다음 액션 |
|------|------|----------|
| `pending` | 리더 검토 대기 | 결과 알림 대기 |
| `approved` | 승인 완료 | 해당 퀘스트로 active 인증 |
| `rejected` | 반려 (revisionCount < 2) | 수정 후 재제출 가능 |
| `revision_pending` | 수정본 재검토 중 | 결과 알림 대기 |
| `expired` | 2회 반려 초과 or 마감 | 개인 퀘스트 없이 진행 or disqualified |

#### 7일 플로우

| Day | 행동 | API | 결과 | 누적 점수 |
|-----|------|-----|------|---------|
| D1 | 공통 퀘스트(운동) + 개인 퀘스트(식단) 동시 인증 | `POST /verifications` × 2 | +10pt +10pt | 20 |
| D2 | 운동만 인증 (식단 누락) | `POST /verifications` | +10pt | 30 |
| D3 | 두 퀘스트 모두 인증 | `POST /verifications` × 2 | +10pt +10pt | 50 |
| D4 | 운동만 인증 | `POST /verifications` | +10pt | 60 |
| D5 | 두 퀘스트 모두 인증 | `POST /verifications` × 2 | +10pt +10pt | 80 |
| D6 | 인증 + **D2 개인 퀘스트 레메디** | `POST /verifications` + `POST /verifications/remedy` | +10pt +7pt | 97 |
| D7 | 마지막 인증 | `POST /verifications` × 2 | +10pt +10pt | 117 |

**결과**: 완주(completed)

---

### 시나리오 5 — 멀티레이어 통합형 (`mixed` + `open`)

**예시 챌린지**: 종합 웰니스 챌린지 (운동+식단+명상)

**특징**
- A(공통) + B(리더 확장) + D(개인화) 레이어 퀘스트 모두 참여
- 가장 풍부한 인증 경험, 최대 레메디 허용
- 개인화 극대화, 참여자가 자신만의 루틴 설계 가능
- 완주 조건: 레이어별 정책에 따름 (ADR-0001 기준: A/B는 레메디 포함 100% 달성)

#### 7일 플로우

| Day | 행동 | API | 결과 | 누적 점수 |
|-----|------|-----|------|---------|
| D1 | A(운동) + B(영양제 복용) + D(명상 15분) 인증 | `POST /verifications` × 3 | +30pt | 30 |
| D2 | A + D 인증, B 누락 | `POST /verifications` × 2 | +20pt | 50 |
| D3 | A + B + D 인증 | `POST /verifications` × 3 | +30pt | 80 |
| D4 | A만 인증 | `POST /verifications` | +10pt | 90 |
| D5 | A + B + D 인증 (조기 완료 → 응원권 발급) | `POST /verifications` × 3 | +30pt + 응원권 | 120 |
| D6 | 인증 + **D2(B 누락) + D4(B,D 누락) 레메디** | `POST /verifications` × 3 + `POST /verifications/remedy` × 2 | +30pt +7pt +7pt | 164 |
| D7 | 마지막 인증 | `POST /verifications` × 3 | +30pt | 194 |

**결과**: 완주(completed)

---

## 4. 참여자 유저 플로우 4가지 (액션 기준)

### 플로우 A: 챌린지 발견/참여

```
1. 챌린지 상세 진입
   └─ lifecycle 확인: recruiting 아니면 → 상태별 안내 메시지 노출
       (draft: 준비 중 / preparing: 모집 마감 / active: 진행 중 / completed: 종료)

2. challengeType에 따라 입력 화면 분기
   ├─ leader_only: 추가 입력 없음 (바로 참여 가능)
   ├─ personal_only: personalGoal + personalTarget 필수 입력
   ├─ leader_personal: personalTarget 필수, personalGoal 선택
   └─ mixed: personalGoal + personalTarget 필수

3. POST /challenges/{id}/join
   └─ 응답: userChallengeId, phase=preparing, challengeType, layerPolicy, proposalDeadline

4. personalQuestEnabled=true 챌린지라면
   └─ 제안 제출 유도 (플로우 B로 연결)
```

**API**: `POST /challenges/{challengeId}/join`

**라이프사이클 상태별 참여 버튼 CTA**

| 상태 | 버튼 | 불가 사유 |
|------|------|----------|
| `recruiting` | 참여하기 (활성) | - |
| `draft` | 참여하기 (비활성) | 아직 모집 전입니다 |
| `preparing` | 참여하기 (비활성) | 모집이 마감되었습니다 |
| `active` | 참여하기 (비활성) | 이미 챌린지가 진행 중입니다 |
| `completed` | 참여하기 (비활성) | 종료된 챌린지입니다 |

---

### 플로우 B: 개인 퀘스트 제안/검토

```
1. 제안 제출 (recruiting 또는 preparing 상태에서만)
   └─ 마감 기준: challengeStartAt - 1일 @ 23:59 KST
   └─ POST /challenges/{id}/personal-quest
      Request: { userChallengeId, title, description?, verificationType }

2. 승인 모드 분기
   ├─ 자동 승인 (autoApprove=true): 즉시 approved
   └─ 수동 승인: status=pending → 리더 알림 발송

3. 수동 승인 시 리더 검토
   ├─ 승인 → approved → 완료
   └─ 반려 → rejected (feedback 포함)
       └─ 참여자: 수정 재제출 (PATCH /challenges/{id}/personal-quest/{proposalId})
           ├─ revisionCount < 2 → revision_pending → 재심사
           └─ revisionCount >= 2 → expired → disqualified 처리

4. 챌린지 시작 D-day 00:00 도달 시
   └─ pending/revision_pending → expired 자동 처리
```

**개인 퀘스트 상태별 참여자 다음 액션**

| 상태 | 참여자 다음 액션 |
|------|----------------|
| `pending` | 리더 결과 알림 대기 |
| `approved` | active 전환 후 해당 퀘스트 기준으로 인증 |
| `rejected` (revisionCount < 2) | 수정 후 재제출 버튼 활성 |
| `revision_pending` | 재심사 결과 알림 대기 |
| `expired` | 개인 퀘스트 없이 진행 or disqualified 확인 |

---

### 플로우 C: 일일 인증 (Day 1~7)

```
1. active 상태 + 해당 day에 수행 완료
   └─ 인증 제출: POST /verifications
      Request: { userChallengeId, day, imageUrl?, todayNote, tomorrowPromise?,
                 verificationDate, performedAt, completedAt, targetTime?, isPublic, isAnonymous }

2. 서버 검증
   ├─ practiceAt 검증: uploadAt - 4h <= practiceAt <= uploadAt
   ├─ day 정합성: verificationDate와 challengeStartAt 기반 계산, ±1 허용
   └─ 중복 체크: 동일 day 이미 성공 여부

3. 결과 분기
   ├─ 첫 성공: progress[day]=success, +10pt, delta 계산, 연속일 갱신
   │   └─ delta > 0 + 그룹 미완료자 존재 → 응원권 발급
   └─ 이미 성공한 day 재인증: isExtra=true, 0pt, 별도 기록

4. 뱃지 조건
   ├─ 연속 3일 달성 → 3-day streak 뱃지
   └─ 7일 완주 → master 뱃지
```

**인증 결과 응답 구조**

```json
{
  "verificationId": "UUID",
  "isExtra": false,
  "day": 3,
  "delta": 15,
  "isEarlyCompletion": true,
  "scoreEarned": 10,
  "totalScore": 30,
  "consecutiveDays": 3,
  "cheerOpportunity": {
    "hasIncompletePeople": true,
    "incompleteCount": 4,
    "canCheerNow": true,
    "cheerTicketGranted": true
  },
  "newBadges": ["3-day-streak"]
}
```

---

### 플로우 D: 보완(레메디) — Day 6 전용

```
1. Day 6 진입 시에만 보완 메뉴 활성
   └─ 정책 확인: remedyPolicy가 strict이면 보완 메뉴 미노출

2. 복구 대상 선택
   └─ progress[Day 1~5] 중 status=null(실패) 항목 목록
   └─ 이미 레메디한 day는 제외
   └─ limited: maxRemedyDays 초과 시 비활성

3. 보완 인증 제출: POST /verifications/remedy
   Request: { userChallengeId, originalDay, imageUrl?, reflectionNote(10~500자),
              todayNote, tomorrowPromise?, completedAt?, practiceAt? }

4. 결과
   └─ progress[originalDay] = success(remedied)
   └─ +7점 (base 10pt × 0.7)
   └─ 응원권 발급 (remedy 전용)
```

**레메디 정책별 메뉴 노출 여부**

| 정책 | Day 6 보완 메뉴 | 최대 버튼 활성 수 |
|------|----------------|-----------------|
| `strict` | 미노출 | 0 |
| `limited` | 노출 | maxRemedyDays (1~2) |
| `open` | 노출 | 최대 5 (실패일 수 이내) |

---

## 5. UX 개선 우선순위 제안

### P0 — 즉시 개선 필요

| 항목 | 현재 문제 | 개선 방향 |
|------|----------|----------|
| 타입/정책 안내 | 참여 화면에서 challengeType, remedyPolicy 정보 미노출 | 참여 화면에서 문장형으로 즉시 안내 (예: "매일 직접 목표를 설정하고 인증하는 챌린지입니다") |
| 상태별 CTA 불일치 | recruiting/preparing/active별 버튼 문구 불통일 | 상태별 버튼 문구와 불가 사유 일관화 (위 플로우 A 표 참조) |

### P1 — 단기 개선

| 항목 | 현재 문제 | 개선 방향 |
|------|----------|----------|
| 개인 퀘스트 상태 가시화 | pending/rejected/revision_pending 상태를 사용자가 인지하기 어려움 | 상태칩 + 다음 액션 버튼 명확화 (위 플로우 B 표 참조) |
| 보완 가능성 사전 알림 | Day 6에 보완 가능하다는 것을 유저가 사전에 모름 | Day 4~5에 "X일 남음, 보완 정책/남은 보완 횟수" 선제 노출 |

### P2 — 중기 개선

| 항목 | 현재 문제 | 개선 방향 |
|------|----------|----------|
| extra 기록 퍼블리시 UX | extra 인증 공개/비공개 전환 동선 불명확 | 일괄 공개 전환 기능, 피드 상단 고정으로 재시도 유도 |
| 레메디 횟수 잔여 표시 | 남은 레메디 가능 횟수 미노출 | 진행 화면에 "레메디 가능 X회 남음" 상시 노출 |

---

## 6. 시나리오별 요약 비교

| 시나리오 | challengeType | remedyPolicy | 개인 퀘스트 | 완주 난이도 | 특징 |
|---------|--------------|--------------|------------|------------|------|
| 1. 엄격 완주형 | leader_only | strict | 없음 | 최고 | 7일 무결점 필요 |
| 2. 리더 가이드형 | leader_only | limited | 없음 | 중상 | 1~2일 레메디 허용 |
| 3. 자기설계 자유형 | personal_only | open | 자동 승인 | 중하 | 개인 목표 직접 설정 |
| 4. 구조적 병행형 | leader_personal | limited | 리더 승인 | 중 | 공통+개인 퀘스트 병행 |
| 5. 멀티레이어 통합형 | mixed | open | 리더 승인 | 중 (가장 풍부) | A/B/D 레이어 전체 |
