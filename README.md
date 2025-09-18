# RAG Chatbot — Backend

Express-based backend for the RAG (Retrieval-Augmented Generation) chatbot.  
Provides API endpoints for session management, chat, and document search.  
Uses Qdrant for vector search (with in-memory fallback).

---

## Features

- Session management (`/api/session`)
- Chat endpoint (`/api/chat/message`)
- Search endpoint (`/api/search`)
- Health check (`/healthz`)
- Qdrant vector store support with in-memory + persisted fallback
- Scripts for ingesting and testing articles

---

## Project Structure

rag-chatbot-backend/
├── data/ # news_articles.json + vector_store.json
├── scripts/ # ingestNews.js, testSearch.js, dumpStore.js
├── src/
│ ├── app.js # Express app
│ ├── services/ # vectorService, cacheService, embeddingService
│ └── routes/ # (search routes etc.)
├── server.js # entrypoint
├── package.json
├── .env # environment variables
└── README.md


---

## Setup

### 1. Clone and Install
```bash
git clone https://github.com/pandeyshikha123/rag-chatbot-backend.git
cd rag-chatbot-backend
npm install

### 2. Environment Variables

Create a .env file in the project root:

PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=news
OPENAI_API_KEY=sk-xxxxxx   # optional
REDIS_URL=redis://127.0.0.1:6379

---

### 3. Run the Server

node server.js
npm start        # production
npm run dev      # development (nodemon)

Server starts at:
http://localhost:4000

---

## Scripts

Ingest sample articles
node scripts/ingestNews.js

Test a query
node scripts/testSearch.js "park downtown"

Dump stored docs
node scripts/dumpStore.js

---

🔗 API Endpoints
Health
GET /healthz

Create Session
POST /api/session
Response: { "sessionId": "xxxx" }

Chat Message
POST /api/chat/message
Body: { "sessionId": "xxxx", "message": "park downtown", "k": 3 }

Search
POST /api/search
Body: { "query": "park downtown" }

---

☁️ Deployment
Render

Build Command: npm install

Start Command: node server.js

Set PORT, FRONTEND_ORIGIN, OPENAI_API_KEY, etc. in Render dashboard.

---

Backend live at:
https://rag-chatbot-backend-t4ly.onrender.com

---

🛠 Troubleshooting

Qdrant not available → Falls back to in-memory store.

OpenAI quota exceeded → Falls back to local embedding.

Redis missing → Uses in-memory cache.




