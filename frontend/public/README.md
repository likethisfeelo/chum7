# 수동으로 넣어야 하는 이미지 자산

리사이즈/이미지 도구가 빌드 환경에 없어, 아래 두 파일은 직접 넣어주세요.

## 1. 앱 아이콘 — `public/icons/icon-512.png`
- 512 × 512 정사각 PNG (CHUM 7 손 모양 아이콘)
- PWA 설치 아이콘 / iOS 홈 화면 아이콘 / 설치 안내 시트 미리보기에 사용
- 자세한 내용: `public/icons/README.md`

## 2. 공유 대표 이미지(OG) — `public/og-image.png`
- 1280 × 720 (16:9) PNG — 제공된 "CHUM 7 / Challengers with me within 7 days" 배너
- 카카오톡·페이스북·트위터 등에서 링크 공유 시 미리보기 썸네일로 사용
- `index.html`의 `og:image` / `twitter:image`가 `https://chum7.com/og-image.png`를 가리킵니다.

> 두 파일을 넣은 뒤 프론트엔드를 다시 빌드/배포해야 반영됩니다.
> (OG 미리보기는 카카오/페북 캐시가 있어, 갱신이 늦으면 각 플랫폼의 디버거로 캐시를 새로고침하세요.)
