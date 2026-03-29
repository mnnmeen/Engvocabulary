# 後端部署到 Railway

## 部署步驟

### 1. 在 Railway 上建立新專案
1. 進入 [railway.app](https://railway.app)
2. 按 "New Project"
3. 選擇 "Deploy from GitHub"
4. 連接你的 GitHub repository

### 2. 配置 Railway 部署設定
1. 在 Railway Dashboard 選擇你的 project
2. 按 "Add" → "GitHub Repo"
3. 在部署設定中：
   - **Root Directory**: `backend` (很重要！)
   - **Start Command**: 自動檢測 `Procfile`

### 3. 設定環境變數
在 Railway 的 Environment 頁面，設定以下變數：

```
MONGODB_URI=mongodb+srv://[username]:[password]@[cluster]...
GEMINI_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
MISTRAL_AI_API_KEY=your_key_here
FRONTEND_ORIGINS=https://your-vercel-frontend.vercel.app
```

### 4. 部署完成
- Railway 自動部署
- 你會得到一個 `.railway.app` 域名
- 複製該 URL

### 5. 連接前端到後端
在前端環境變數中設定：
```
NEXT_PUBLIC_API_BASE=https://your-backend.railway.app
```

---

## 注意事項

⚠️ **不要上傳 `.env` 檔案**
- 在 `.gitignore` 中已經寫了
- 環境變數必須在 Railway dashboard 中設定

✅ **檢查清單**
- [ ] `requirements.txt` 已建立
- [ ] `Procfile` 已建立
- [ ] `.env` 在 `.gitignore` 中
- [ ] Railway 部署成功
- [ ] 環境變數都已設定
- [ ] CORS 允許 Vercel 域名
