# CHME (Challenge Earth with ME)

## 🚀 Quick Start

### DEV Deployment
```powershell
./scripts/deploy-dev.ps1
```
- 🌐 App: https://test.chum7.com
- 🔌 API: https://dev.chum7.com

### PROD Deployment
```powershell
./scripts/deploy-prod.ps1
```
- 🌐 App: https://www.chum7.com
- 🔌 API: https://api.chum7.com

## 🏗️ Infrastructure

### Domain Structure

**DEV:**
- Web: test.chum7.com → CloudFront (ESKW3DSSHIUK9) → S3 (chme-dev)
- API: dev.chum7.com → API Gateway (so2kfxsg87)
- Images: test.chum7.com/uploads/* → S3 (chum7-dev-uploads)

**PROD:**
- Web: www.chum7.com → CloudFront (EUM1ULUXR9NQZ) → S3 (chum7-prod-static)
- API: api.chum7.com → API Gateway (ykybo6jeh)
- Images: www.chum7.com/uploads/* → S3 (chum7-prod-uploads)

### CloudFront Path Routing

Both distributions use the same pattern:
- `/` → Web App Origin
- `/uploads/*` → Uploads Origin

## 📦 Project Structure
```
chme/
├── frontend/          # React PWA
│   ├── .env.dev      # DEV config
│   └── .env.prod     # PROD config
├── backend/
│   └── shared/
│       └── lib/
│           └── s3.ts # Updated for new domains
├── infra/
│   ├── config/
│   │   ├── dev.ts    # DEV infrastructure config
│   │   └── prod.ts   # PROD infrastructure config
│   └── stacks/
│       └── core-stack.ts
└── scripts/
    ├── deploy-dev.ps1
    └── deploy-prod.ps1
```

## 🔧 Configuration Files

### Important Changes

1. **Domains**: challengeus.me → chum7.com
2. **CloudFront IDs**: Using existing distributions
3. **S3 Buckets**: 
   - DEV: chme-dev, chum7-dev-uploads
   - PROD: chum7-prod-static, chum7-prod-uploads
4. **API Gateway IDs**: Using existing gateways

### Environment Variables

Update these in `.env.dev` and `.env.prod`:
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`

## 📝 Deployment Checklist

Before deploying:
- [ ] Update Cognito IDs in .env files
- [ ] Verify AWS CLI is configured
- [ ] Check S3 buckets exist
- [ ] Confirm CloudFront distributions are active
- [ ] Verify API Gateway custom domains


## 🛠️ Maintenance Scripts

### Backfill challenge layer policy

Normalize `layerPolicy` for legacy challenges so `personal_only` and `leader_personal` always require personal goal on join.

Dry-run:
```bash
CHALLENGES_TABLE=<table-name> npm run backfill:challenge-layer-policy
```

Apply updates:
```bash
CHALLENGES_TABLE=<table-name> npm run backfill:challenge-layer-policy -- --apply
```

## 🔗 Links

- DEV: https://test.chum7.com
- PROD: https://www.chum7.com

---

Built with ❤️ using React, AWS, TypeScript