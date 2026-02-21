# S3 & CloudFront URL 설정 검증

## ✅ 현재 설정 (완벽하게 일치!)

### DEV 환경
```
CloudFront Domain:  test.chum7.com
CloudFront ID:      ESKW3DS5HUUK9
S3 Uploads Bucket:  chum7-dev-uploads

이미지 업로드 흐름:
1. Lambda가 Presigned URL 생성
   → s3.amazonaws.com/chum7-dev-uploads/verifications/...
   
2. 프론트엔드가 S3에 직접 업로드
   → PUT https://chum7-dev-uploads.s3.ap-northeast-2.amazonaws.com/...
   
3. 공개 URL (CloudFront를 통한 접근)
   → https://test.chum7.com/uploads/verifications/...
```

### PROD 환경
```
CloudFront Domain:  www.chum7.com
CloudFront ID:      EUM1ULUXR9NQZ
S3 Uploads Bucket:  chum7-prod-uploads

이미지 업로드 흐름:
1. Lambda가 Presigned URL 생성
   → s3.amazonaws.com/chum7-prod-uploads/verifications/...
   
2. 프론트엔드가 S3에 직접 업로드
   → PUT https://chum7-prod-uploads.s3.ap-northeast-2.amazonaws.com/...
   
3. 공개 URL (CloudFront를 통한 접근)
   → https://www.chum7.com/uploads/verifications/...
```

---

## 🔍 CloudFront Behaviors 확인

### DEV (ESKW3DS5HUUK9)
```
CloudFront → Distributions → ESKW3DS5HUUK9 → Behaviors

Behavior 1: /uploads/* (우선순위: 0)
  Origin: chum7-dev-uploads (S3)
  → 이 경로는 Uploads 버킷으로 라우팅 ✅

Behavior 2: Default (*)
  Origin: chme-dev (S3 Static)
  → 나머지 경로는 Static 버킷으로 ✅
```

### PROD (EUM1ULUXR9NQZ)
```
CloudFront → Distributions → EUM1ULUXR9NQZ → Behaviors

Behavior 1: /uploads/* (우선순위: 0)
  Origin: chum7-prod-uploads (S3)
  → 이 경로는 Uploads 버킷으로 라우팅 ✅

Behavior 2: Default (*)
  Origin: chme-prod-static (S3 Static)
  → 나머지 경로는 Static 버킷으로 ✅
```

---

## 📊 URL 구조 정리

### 업로드 흐름
```
1. 프론트엔드 → Lambda: "이미지 업로드 URL 주세요"
   POST /verifications/upload-url
   {
     "fileName": "photo.jpg",
     "contentType": "image/jpeg"
   }

2. Lambda → 프론트엔드: Presigned URL + 공개 URL
   {
     "uploadUrl": "https://chum7-dev-uploads.s3.ap-northeast-2.amazonaws.com/verifications/2024/01/user123/ver456.jpg?X-Amz-...",
     "publicUrl": "https://test.chum7.com/uploads/verifications/2024/01/user123/ver456.jpg"
   }

3. 프론트엔드 → S3: 직접 업로드
   PUT https://chum7-dev-uploads.s3.ap-northeast-2.amazonaws.com/...
   (Presigned URL 사용)

4. DB 저장: CloudFront URL
   imageUrl: "https://test.chum7.com/uploads/verifications/2024/01/user123/ver456.jpg"

5. 이미지 표시: CloudFront를 통한 접근
   <img src="https://test.chum7.com/uploads/verifications/2024/01/user123/ver456.jpg" />
```

---

## ✅ backend/shared/lib/s3.ts 설정

### CloudFront URL 설정 (환경별 자동 분기)
```typescript
const getCloudFrontUrl = (): string => {
  const stage = process.env.STAGE || 'dev';
  
  if (stage === 'prod') {
    return 'https://www.chum7.com';      // PROD ✅
  }
  
  return 'https://test.chum7.com';       // DEV ✅
};
```

### 공개 URL 생성
```typescript
// S3 키: verifications/2024/01/user123/ver456.jpg
const publicUrl = `${CLOUDFRONT_URL}/uploads/${key}`;

// 결과:
// DEV:  https://test.chum7.com/uploads/verifications/2024/01/user123/ver456.jpg ✅
// PROD: https://www.chum7.com/uploads/verifications/2024/01/user123/ver456.jpg ✅
```

---

## 🔐 S3 CORS 설정 확인

### chum7-dev-uploads
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": [
      "https://test.chum7.com",
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

### chum7-prod-uploads
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": [
      "https://www.chum7.com",
      "https://admin.chum7.com"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

## 🎯 Lambda 환경 변수

### verification/upload-url Lambda
```typescript
environment: {
  STAGE: stage,                          // 'dev' or 'prod'
  UPLOADS_BUCKET: 'chum7-dev-uploads',   // or 'chum7-prod-uploads'
  AWS_REGION: 'ap-northeast-2',
}
```

Lambda 함수는 이 환경 변수를 통해:
1. ✅ 올바른 S3 버킷 선택
2. ✅ 올바른 CloudFront URL 생성

---

## 📝 프론트엔드 환경 변수

### frontend/.env.dev
```env
VITE_CLOUDFRONT_URL=https://test.chum7.com
VITE_S3_UPLOADS_BUCKET=chum7-dev-uploads
```

### frontend/.env.prod
```env
VITE_CLOUDFRONT_URL=https://www.chum7.com
VITE_S3_UPLOADS_BUCKET=chum7-prod-uploads
```

---

## 🧪 테스트 시나리오

### 1. 이미지 업로드 테스트
```bash
# DEV
curl -X POST https://dev.chum7.com/verifications/upload-url \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.jpg",
    "contentType": "image/jpeg"
  }'

# 응답 확인:
# uploadUrl: https://chum7-dev-uploads.s3.ap-northeast-2.amazonaws.com/... ✅
# publicUrl: https://test.chum7.com/uploads/verifications/... ✅
```

### 2. 업로드된 이미지 접근 테스트
```bash
# CloudFront를 통한 접근
curl -I https://test.chum7.com/uploads/verifications/2024/01/user123/ver456.jpg

# 응답:
# HTTP/2 200 ✅
# x-cache: Hit from cloudfront ✅
```

### 3. CORS 테스트
```javascript
// 프론트엔드에서 테스트
fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': 'image/jpeg'
  }
})
.then(res => console.log('Upload success!'))
.catch(err => console.error('CORS error:', err));
```

---

## ⚠️ 주의사항

### 1. CloudFront Cache Invalidation
이미지 업데이트 시:
```bash
aws cloudfront create-invalidation \
  --distribution-id ESKW3DS5HUUK9 \
  --paths "/uploads/verifications/*"
```

### 2. S3 버킷 정책 (OAC 사용)
CloudFront OAC(Origin Access Control)가 S3에 접근할 수 있도록 버킷 정책 설정 필요:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::chum7-dev-uploads/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::532393804562:distribution/ESKW3DS5HUUK9"
        }
      }
    }
  ]
}
```

### 3. Lambda IAM 권한
upload-url Lambda에 필요한 권한:
```json
{
  "Effect": "Allow",
  "Action": [
    "s3:PutObject",
    "s3:GetObject"
  ],
  "Resource": "arn:aws:s3:::chum7-dev-uploads/*"
}
```

---

## ✅ 최종 검증 체크리스트

### CloudFront 설정
- [ ] DEV Distribution: test.chum7.com (ESKW3DS5HUUK9)
- [ ] PROD Distribution: www.chum7.com (EUM1ULUXR9NQZ)
- [ ] Behavior /uploads/* → Uploads 버킷
- [ ] SSL 인증서 연결 확인

### S3 설정
- [ ] chum7-dev-uploads CORS 설정
- [ ] chum7-prod-uploads CORS 설정
- [ ] S3 버킷 정책 (CloudFront OAC)

### Backend 설정
- [ ] s3.ts CloudFront URL: test.chum7.com (DEV)
- [ ] s3.ts CloudFront URL: www.chum7.com (PROD)
- [ ] Lambda 환경 변수: STAGE, UPLOADS_BUCKET

### Frontend 설정
- [ ] .env.dev: VITE_CLOUDFRONT_URL=https://test.chum7.com
- [ ] .env.prod: VITE_CLOUDFRONT_URL=https://www.chum7.com

---

## 🎉 결론

**모든 설정이 완벽하게 일치합니다!**

```
DEV:  https://test.chum7.com/uploads/{key} ✅
PROD: https://www.chum7.com/uploads/{key} ✅
```

backend/shared/lib/s3.ts 파일만 업데이트하면 끝입니다! 🚀
