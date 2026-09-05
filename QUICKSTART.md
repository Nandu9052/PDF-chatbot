# 🚀 Quick Start Guide — AI PDF Chatbot

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | v18+ (v20 recommended) | https://nodejs.org |
| Yarn | latest | `npm install -g yarn` |
| OpenAI account | — | https://platform.openai.com |
| Supabase account | — | https://supabase.com |

---

## Step 1 — Set Up Supabase

1. Create a free project at https://app.supabase.com
2. Go to **SQL Editor** in your project dashboard
3. Paste and run the contents of [`supabase-setup.sql`](./supabase-setup.sql)
4. Copy your credentials from **Settings → API**:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Configure Environment Variables

### Backend (`backend/.env`)

Open `backend/.env` and fill in your values:

```env
GROQ_API_KEY=your_groq_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=ai-agent-pdf-chatbot
```

### Frontend (`frontend/.env`)

The frontend `.env` is already configured for local development. No changes needed unless you have a LangSmith key:

```env
NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:2024
LANGCHAIN_API_KEY=          # Optional: only needed for LangSmith tracing
LANGGRAPH_INGESTION_ASSISTANT_ID=ingestion_graph
LANGGRAPH_RETRIEVAL_ASSISTANT_ID=retrieval_graph
LANGCHAIN_TRACING_V2=false
```

---

## Step 3 — Install Dependencies

From the **project root** (the folder containing `package.json`, `backend/` and `frontend/`):

```bash
yarn install
```

---

## Step 4 — Start the Backend (LangGraph Server)

Open a **terminal** and run:

```bash
cd backend
yarn langgraph:dev
```

✅ The LangGraph server starts on **http://localhost:2024**  
✅ LangGraph Studio opens in your browser for debugging

---

## Step 5 — Start the Frontend (Next.js)

Open a **second terminal** and run:

```bash
cd frontend
yarn dev
```

✅ The Next.js app starts on **http://localhost:3000**

---

## Step 6 — Use the Chatbot

1. Open **http://localhost:3000** in your browser
2. Click the **📎 paperclip** icon to upload a PDF (max 5 files, 10 MB each)
3. Wait for the "✅ uploaded successfully" toast
4. Type a question about your PDF and press **Enter** or the **↑ send** button
5. Watch the answer stream in real-time with source references

---

## Architecture

```
Browser                    Next.js (port 3000)         LangGraph (port 2024)
  │                              │                             │
  │── Upload PDF ───────────────>│                             │
  │                    /api/ingest                             │
  │                    ├── parse PDF to Documents              │
  │                    └── POST ingestion_graph ──────────────>│
  │                                               ingestDocs node:
  │                                               └── embed + store in Supabase
  │<── "Uploaded!" ─────────────│                             │
  │                              │                             │
  │── Ask question ─────────────>│                             │
  │                    /api/chat                               │
  │                    └── stream retrieval_graph ────────────>│
  │                                               checkQueryType node
  │                                               └── route: retrieve | direct
  │                                               retrieveDocuments node
  │                                               └── similarity search Supabase
  │                                               generateResponse node
  │                                               └── OpenAI gpt-4o-mini + context
  │<── Streamed answer ─────────│<─── SSE stream ─────────────│
```

---

## Troubleshooting

### "Error creating thread" on page load
- Make sure the LangGraph backend is running on port 2024: `cd backend && yarn langgraph:dev`
- Check `NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:2024` in `frontend/.env`

### Upload fails with "No valid documents extracted"
- Ensure the PDF is not password-protected or scanned image-only
- Check `OPENAI_API_KEY` is valid in `backend/.env`

### "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are not defined"
- Fill in `backend/.env` with your Supabase credentials
- Make sure you ran `supabase-setup.sql` in your Supabase SQL Editor

### Answers are not using PDF content / "I don't know"
- The ingestion may have failed — check the backend terminal for errors
- Try uploading the PDF again
- Make sure `match_documents` function exists in Supabase (re-run `supabase-setup.sql`)

### LangGraph server won't start
- Ensure Node.js v18+ is installed: `node --version`
- Run `yarn install` from the project root first
- Check `backend/.env` exists and has `OPENAI_API_KEY` set

---

## Project Structure

```
ai-pdf-chatbot-langchain/
├── backend/                   # LangGraph server
│   ├── src/
│   │   ├── ingestion_graph/   # PDF → Supabase embeddings
│   │   ├── retrieval_graph/   # Q&A with RAG
│   │   └── shared/            # Config, retrieval utils
│   ├── langgraph.json         # Graph entrypoints
│   └── .env                   # ← fill this in
├── frontend/                  # Next.js 14 app
│   ├── app/
│   │   ├── api/chat/          # Streams from retrieval_graph
│   │   ├── api/ingest/        # Sends PDFs to ingestion_graph
│   │   └── page.tsx           # Main chat UI
│   ├── components/            # ChatMessage, FilePreview, etc.
│   └── .env                   # ← already configured for local dev
├── supabase-setup.sql         # ← run this in Supabase SQL Editor
└── QUICKSTART.md              # This file
```
