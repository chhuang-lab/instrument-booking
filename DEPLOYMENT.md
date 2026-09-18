# 部署與維護

## Cloudflare 資源

- Worker：`instrument-booking-api`
- Worker URL：`https://instrument-booking-api.chhuang-586.workers.dev`
- D1：`instrument-booking-db`
- D1 binding：`DB`

## 必要 Secrets

在 Worker 的 Settings → Variables and Secrets 新增兩個 Secret：

- `ADMIN_PASSWORD`：管理員登入密碼
- `ADMIN_TOKEN_SECRET`：至少 32 個字元的隨機字串

Secret 不可放入 GitHub repository。

## GitHub Pages

Repository Settings → Pages：

- Source：Deploy from a branch
- Branch：`main`
- Folder：`/(root)`

網站網址：`https://chhuang-lab.github.io/instrument-booking/`

## Worker 自動部署

Cloudflare Worker → Settings → Builds → Connect repository，選擇：

- Repository：`chhuang-lab/instrument-booking`
- Production branch：`main`
- Build command：`npm install`
- Deploy command：`npx wrangler deploy`

## 備份

管理員頁面可以匯出完整 CSV。建議每月下載一次，另存於管理者持有的雲端資料夾。
