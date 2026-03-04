# Challenge Feed 익명 ID 생성 규격 (v1)

- version: 1.0.0
- updatedAt: 2026-03-04
- owner: CHME Backend

---

## 1) 목표

- 피드에서 개인 식별정보 없이 상호작용 문맥 제공
- 동일 사용자라도 날짜가 바뀌면 익명 ID 변경
- 챌린지 간 상호 추적 불가
- 서버 비밀값(SALT) 없이 역산 불가

---

## 2) 출력 포맷

- 형식: `{동물명}-{3자리숫자}`
- 예시: `고래-274`, `수달-901`

---

## 3) 생성 알고리즘

### 입력
- `challengeId` (string)
- `userId` (string)
- `dateKey` (YYYY-MM-DD, KST 기준)
- `ANON_ID_SALT` (secret env)

### 계산
1. `seed = SHA256(challengeId + ":" + userId + ":" + dateKey + ":" + ANON_ID_SALT)`
2. `animalIndex = toUint(seed[0..7]) % ANIMAL_DICTIONARY.length`
3. `number = (toUint(seed[8..15]) % 900) + 100`
4. `dailyAnonymousId = ANIMAL_DICTIONARY[animalIndex] + "-" + number`

### 사전
- `ANIMAL_DICTIONARY`는 고정 배열(예: 256개).
- 운영 중 사전 순서 변경 금지(기존 값 일관성 보존).

---

## 4) 시간대 규칙

- 날짜 기준은 서비스 정책상 `Asia/Seoul`.
- 경계 시각(00:00 KST) 이후 신규 이벤트부터 새로운 익명 ID 적용.

---

## 5) 저장/노출 규칙

- 댓글 저장 시 `dailyAnonymousId` 함께 저장(조회 최적화).
- API 응답에서 사용자 이름 대신 `dailyAnonymousId` 노출.
- 운영 감사 목적이 아닌 이상 `userId` 직접 노출 금지.

---

## 6) 보안/운영

- `ANON_ID_SALT`는 Secrets Manager 관리, 90일 회전 권장.
- SALT 회전 시 과거 데이터 재기록 없음(과거값은 historical snapshot로 유지).
- 충돌률 모니터링: 일자/챌린지 기준 중복률 알림(임계치 예: 8% 초과).

---

## 7) 예외 처리

- 필수 입력 누락 시: `400 INVALID_ANON_INPUT`
- SALT 미설정 시: `500 ANON_SALT_NOT_CONFIGURED`
- 사전 비어있음: `500 ANON_DICTIONARY_NOT_CONFIGURED`

---

## 8) 테스트 케이스

1. 같은 `(challengeId, userId, dateKey)` => 동일 출력
2. 같은 user, date만 변경 => 다른 출력
3. 같은 user, challenge만 변경 => 다른 출력
4. 다른 user, 같은 challenge/date => 대부분 다른 출력
5. KST 자정 경계 전후 출력 변경 검증
