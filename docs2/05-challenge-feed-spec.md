# 챌린지 피드 구조

## 페이지 구성

```
챌린지 피드 (ChallengeFeedPage)
│
├── [헤더] 챌린지 제목 + 설명
│
├── [챌린지 보드 요약]
│   ├── 텍스트 블록 요약 (3줄 제한)
│   ├── "보드 전체 보기" → /challenge-board/{challengeId}
│   └── "퀘스트 보드" → /quests?challengeId={challengeId}
│       (challengeType에 따라 레이블 및 안내 문구 변경)
│
├── [오늘의 인증] (미인증 상태이거나 영상 오류인 경우만 표시)
│   └── InlineVerificationForm
│
├── [보완 인증] (Day 6이고 실패일 존재하는 경우)
│   └── RemedyForm
│
├── [통계]
│   ├── 오늘 인증 완료 인원 / 전체 참여자 수
│   └── 내 응원권 수
│
└── [인증 피드]
    └── 공개 인증 게시물 목록 (이미지/텍스트/링크/영상)
```

---

## 퀘스트 보드 버튼 (challengeType별)

| challengeType | 버튼 레이블 | 추가 안내 |
|---------------|-------------|-----------|
| `leader_only` | 리더 퀘스트 📋 | 없음 |
| `personal_only` | 개인 퀘스트 📋 | "개인퀘스트로 진행되는 챌린지입니다" |
| `leader_personal` / `mixed` | 퀘스트 보드 📋 | "리더퀘스트 + 개인퀘스트 모두 인증해야 하루 완료" |

---

## 챌린지 보드 (ChallengeBoard)

- 리더가 관리하는 공지/안내 블록 모음
- 블록 타입: `text`, `image`, `link` 등
- 피드 페이지에서는 첫 번째 텍스트 블록 요약만 표시 (3줄)
- 전체 보기는 별도 페이지 `/challenge-board/{challengeId}`

### 댓글 정책 (향후 구현)

- 댓글 기본: 비공개 (리더 + 댓글 작성자만 조회)
- 리더가 댓글 공개 전환 가능
- 공개된 댓글의 대댓글: 리더만 작성, 일반 참여자는 조회만

---

## 인증 피드

- `GET /verifications?isPublic=true&challengeId={id}&limit=50`
- 공개된 인증만 표시 (`isPublic: 'true'`, `isPersonalOnly: false`)
- 표시 순서: 최신순
- 영상 인증: IntersectionObserver로 60% 이상 뷰포트에 들어오면 자동 재생

### 인증 카드 표시 항목

- 인증자 이름/프로필 (익명 여부에 따라)
- Day N 배지
- 이미지 / 텍스트 / 링크 프리뷰 / 영상
- 소감 (`todayNote`)
- 응원 수 (`cheerCount`)
- questType 배지 (leader / personal)

---

## 리더 DM

- 챌린지 피드 하단에 "리더 DM 연결" 버튼
- `POST /challenge-feed/{challengeId}/leader-dm`
- 성공 시 DM 스레드 생성 후 `/messages/{threadId}`로 이동

---

## 영상 검증 상태 (mediaValidationStatus)

비동기로 영상 검증이 진행될 때 처리:

| status | 의미 |
|--------|------|
| `pending` | 검증 중 (15초마다 자동 재조회) |
| `valid` | 정상 영상 |
| `invalid` | 영상 오류 → 사용자에게 재업로드 유도 |

- `pending` 상태의 인증이 있으면 15초 인터벌로 자동 재조회
- `invalid` 상태이면 인증 폼을 다시 표시 (`!iDidTodayVerification || hasInvalidMyVideo`)
