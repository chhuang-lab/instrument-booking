# 儀器線上預約系統 / Instrument Online Booking System

粒徑分析儀（DLS）－Anton Paar 701 的中英文線上預約系統。

## 功能

- 全年 24 小時、每 30 分鐘一格
- 單次最多 3 小時，只能預約未來 14 天
- 自動阻擋重疊預約
- 預約編號與取消碼
- 開始時間前可自行取消
- 公開雙語時段表
- 密碼保護的管理頁面與 CSV 匯出

## 架構

- GitHub Pages：使用者與管理員介面
- Cloudflare Worker：預約規則與 API
- Cloudflare D1：預約資料庫

正式部署與維護方式請見 [DEPLOYMENT.md](DEPLOYMENT.md)。
