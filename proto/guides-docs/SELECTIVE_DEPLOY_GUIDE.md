# 선택적 Lambda 배포 가이드

## 🎯 개요

**필요한 Lambda만 선택해서 배포**할 수 있는 스크립트입니다.

---

## 📋 DEV vs PROD 정리

### 현재 단계: **DEV만 생성** ✅
```
chme-dev-auth-register
chme-dev-challenge-list
chme-dev-verification-submit
...
```

### 나중에: **PROD 생성** (서비스 오픈 전)
```
chme-prod-auth-register
chme-prod-challenge-list
chme-prod-verification-submit
...
```

**결론:** 지금은 DEV만 만들면 됩니다!

---

## ⚡ 사용 방법

### Step 1: 스크립트 열기
```powershell
notepad deploy-selected-lambdas.ps1
```

### Step 2: 필요한 Lambda만 주석 해제

**기본 상태 (Auth + Challenge만 활성화):**
```powershell
$lambdas = @(
    # Auth (5개) - 활성화 ✅
    @{name="chme-dev-auth-register"; ...},
    @{name="chme-dev-auth-login"; ...},
    ...

    # Challenge (5개) - 활성화 ✅
    @{name="chme-dev-challenge-list"; ...},
    ...

    # Verification (5개) - 비활성화 ❌
    # @{name="chme-dev-verification-submit"; ...},
    # @{name="chme-dev-verification-get"; ...},
    ...
)
```

**원하는 Lambda 추가하려면:**
주석(`#`)을 제거하세요!

```powershell
# 비활성화 (주석 있음)
# @{name="chme-dev-verification-submit"; ...},

# 활성화 (주석 제거)
@{name="chme-dev-verification-submit"; ...},
```

### Step 3: 스크립트 실행
```powershell
.\deploy-selected-lambdas.ps1
```

---

## 📦 Lambda 그룹별 설명

### 1. Auth (5개) - **필수!** ⭐⭐⭐
```powershell
@{name="chme-dev-auth-register"; ...},      # 회원가입
@{name="chme-dev-auth-login"; ...},         # 로그인
@{name="chme-dev-auth-refresh"; ...},       # 토큰 갱신
@{name="chme-dev-auth-get-profile"; ...},   # 프로필 조회
@{name="chme-dev-auth-update-profile"; ...} # 프로필 수정
```
→ **기본으로 활성화됨**

### 2. Challenge (5개) - **필수!** ⭐⭐⭐
```powershell
@{name="chme-dev-challenge-list"; ...},     # 챌린지 목록
@{name="chme-dev-challenge-detail"; ...},   # 챌린지 상세
@{name="chme-dev-challenge-join"; ...},     # 챌린지 참여
@{name="chme-dev-challenge-my"; ...},       # 내 챌린지
@{name="chme-dev-challenge-stats"; ...}     # 통계
```
→ **기본으로 활성화됨**

### 3. Verification (5개) - 인증 시스템
```powershell
# @{name="chme-dev-verification-submit"; ...},     # 인증 제출 ⭐
# @{name="chme-dev-verification-get"; ...},        # 인증 조회
# @{name="chme-dev-verification-list"; ...},       # 인증 목록
# @{name="chme-dev-verification-upload-url"; ...}, # 이미지 업로드
# @{name="chme-dev-verification-remedy"; ...}      # Day 6 보완
```
→ **주석 처리됨 (필요하면 활성화)**

### 4. Cheer (7개) - 응원 시스템
```powershell
# @{name="chme-dev-cheer-send-immediate"; ...},  # 즉시 응원
# @{name="chme-dev-cheer-use-ticket"; ...},      # 응원권 사용
# @{name="chme-dev-cheer-send-scheduled"; ...},  # 예약 응원
# @{name="chme-dev-cheer-get-targets"; ...},     # 응원 대상
# @{name="chme-dev-cheer-thank"; ...},           # 감사 표현
# @{name="chme-dev-cheer-get-my"; ...},          # 내 응원
# @{name="chme-dev-cheer-get-scheduled"; ...}    # 예약 응원 조회
```
→ **주석 처리됨 (필요하면 활성화)**

### 5. Admin (6개) - 관리자 기능
```powershell
# @{name="chme-dev-admin-create-challenge"; ...},  # 챌린지 생성
# @{name="chme-dev-admin-update-challenge"; ...},  # 챌린지 수정
# @{name="chme-dev-admin-delete-challenge"; ...},  # 챌린지 삭제
# @{name="chme-dev-admin-toggle-challenge"; ...},  # 활성화/비활성화
# @{name="chme-dev-admin-list-users"; ...},        # 사용자 목록
# @{name="chme-dev-admin-stats"; ...}              # 통계
```
→ **주석 처리됨 (나중에 필요)**

---

## 💡 추천 배포 순서

### Phase 1: 기본 기능 (Auth + Challenge)
```powershell
# 기본으로 활성화되어 있음
.\deploy-selected-lambdas.ps1
```
→ **10개 Lambda 생성**

### Phase 2: 인증 시스템 추가
```powershell
# deploy-selected-lambdas.ps1 열어서
# Verification (5개) 주석 제거
.\deploy-selected-lambdas.ps1
```
→ **15개 Lambda 생성**

### Phase 3: 응원 시스템 추가
```powershell
# Cheer (7개) 주석 제거
.\deploy-selected-lambdas.ps1
```
→ **22개 Lambda 생성**

### Phase 4: 관리자 기능 추가
```powershell
# Admin (6개) 주석 제거
.\deploy-selected-lambdas.ps1
```
→ **28개 Lambda 전부 생성**

---

## 🔧 사용 예시

### 예시 1: Auth + Challenge만 (기본)
```powershell
# 스크립트 그대로 실행
.\deploy-selected-lambdas.ps1

# 결과: 10개 Lambda 생성
```

### 예시 2: Verification 추가하고 싶을 때
```powershell
# 1. 스크립트 열기
notepad deploy-selected-lambdas.ps1

# 2. Verification 섹션 찾기
# Verification (5개)
# @{name="chme-dev-verification-submit"; ...},
# @{name="chme-dev-verification-get"; ...},
# ...

# 3. 주석(#) 제거
@{name="chme-dev-verification-submit"; ...},
@{name="chme-dev-verification-get"; ...},
...

# 4. 저장하고 실행
.\deploy-selected-lambdas.ps1

# 결과: 15개 Lambda 생성 (Auth 5 + Challenge 5 + Verification 5)
```

### 예시 3: 특정 Lambda 1개만 추가
```powershell
# verification-submit만 추가하고 싶다면
@{name="chme-dev-verification-submit"; ...},
# @{name="chme-dev-verification-get"; ...},        # 이건 주석 유지
# @{name="chme-dev-verification-list"; ...},       # 이것도 주석 유지
...
```

---

## ✅ 배포 확인

```powershell
# Lambda 목록 확인
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table

# 개수 확인
aws lambda list-functions --region ap-northeast-2 --query "length(Functions[?starts_with(FunctionName, 'chme-dev')])"
```

---

## 🎯 요약

### Q1: DEV와 PROD를 둘 다 만들어야 하나요?
**A:** 아니요! **지금은 DEV만** 만들면 됩니다.

### Q2: 28개를 전부 만들어야 하나요?
**A:** 아니요! **필요한 것만** 선택해서 만들면 됩니다.

### Q3: 추천 순서는?
**A:** 
1. Auth + Challenge (10개) → 기본 기능 테스트
2. Verification (5개) → 인증 시스템 테스트
3. Cheer (7개) → 응원 시스템 테스트
4. Admin (6개) → 관리자 기능

### Q4: 나중에 추가하려면?
**A:** 스크립트 열어서 주석(`#`) 제거하고 다시 실행!

---

## 🚀 시작하기

```powershell
# 1. 스크립트 실행 (기본: Auth + Challenge 10개)
.\deploy-selected-lambdas.ps1

# 2. 배포 확인
aws lambda list-functions --region ap-northeast-2 --query "Functions[?starts_with(FunctionName, 'chme-dev')].FunctionName" --output table

# 3. 필요하면 추가 Lambda 활성화
notepad deploy-selected-lambdas.ps1
# 주석 제거 후 다시 실행
.\deploy-selected-lambdas.ps1
```

**완료!** ✅
