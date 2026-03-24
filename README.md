# Engvocabulary

這是一個英文單字學習專案，前端使用 Next.js，後端使用 FastAPI。

## 專案結構

```
Engvocabulary/
  ai-english-frontend/   # Next.js 前端 (UI)
  backend/               # FastAPI 後端 (API)
```

## 需求

- Node.js (前端)
- Python 3.10+ (後端)
- MongoDB (本機或遠端)

## 前端 (Next.js)

```bash
cd ai-english-frontend
npm install
npm run dev
```

瀏覽 http://localhost:3000

## 後端 (FastAPI)

1) 在 backend/ 建立 .env，設定 MongoDB 連線字串：

```
MONGODB_URI=mongodb://localhost:27017
```

2) 安裝相依套件並啟動 API：

```bash
cd backend
python -m venv .venv  
///conda activate engvocab-backend  輸入這個
.venv\Scripts\activate
pip install fastapi uvicorn motor python-dotenv
uvicorn main:app --reload --port 8000
```

API 會跑在 http://localhost:8000

## 快速檢查

- Health: http://localhost:8000/health
- List words: http://localhost:8000/words

## 備註

- 後端預設允許 http://localhost:3000 的 CORS。
- 如需修改資料庫名稱，請調整 backend/db.py（預設 english_words）。
