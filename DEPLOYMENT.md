# 🌐 1-Click Full-Stack Website Deployment Guide

You can deploy the **entire project (both Frontend & Backend together as 1 single live website)** for free using **Render**, **Koyeb**, or **Railway**.

---

## 🌟 Method 1: Deploy as a Single Live Website on [Render.com](https://render.com) (Easiest & Free)

Because we created `render.yaml` and a unified production `Dockerfile`, you can deploy both frontend and backend together under **one single website URL**.

### Steps:
1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Full-stack deployment ready"
   git push origin main
   ```
2. Go to **[dashboard.render.com](https://dashboard.render.com)**.
3. Click **New +** $\rightarrow$ **Web Service** (or **Blueprint**).
4. Connect your **GitHub repository**.
5. Configure:
   - **Name**: `my-ai-pdf-chatbot` (or any name you choose)
   - **Runtime**: `Node` (or `Docker`)
   - **Build Command**: `yarn && yarn build`
   - **Start Command**: `yarn start`
   - **Plan**: `Free`
6. Add your **Environment Variables**:
   | Variable | Value |
   |---|---|
   | `GROQ_API_KEY` | `gsk_...` (Your Groq Key) |
   | `SUPABASE_URL` | `https://...supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `ey...` (Your Supabase Secret Key) |
   | `LANGGRAPH_API_URL` | `http://127.0.0.1:2024` |
   | `LANGGRAPH_RETRIEVAL_ASSISTANT_ID` | `retrieval_graph` |
   | `LANGGRAPH_INGESTION_ASSISTANT_ID` | `ingestion_graph` |
7. Click **Deploy Web Service**.

🎉 In 2 minutes, your website will be live at `https://my-ai-pdf-chatbot.onrender.com`!

---

## 🚀 Method 2: Deploy on [Railway.app](https://railway.app) (Free & Instant)

1. Go to **[railway.app](https://railway.app)** and click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
2. Select your repository.
3. Click **Variables** and add:
   - `GROQ_API_KEY`: `<Your Groq Key>`
   - `SUPABASE_URL`: `<Your Supabase URL>`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<Your Supabase Service Role Key>`
   - `LANGGRAPH_API_URL`: `http://127.0.0.1:2024`
   - `LANGGRAPH_RETRIEVAL_ASSISTANT_ID`: `retrieval_graph`
   - `LANGGRAPH_INGESTION_ASSISTANT_ID`: `ingestion_graph`
4. Under **Settings** $\rightarrow$ **Networking**, click **Generate Domain**.
5. Railway will automatically build the `Dockerfile` and give you a live URL (e.g. `https://ai-pdf-chatbot.up.railway.app`).

---

## ⚡ Method 3: Deploy on [Koyeb.com](https://koyeb.com) (Free Tier)

1. Go to **[koyeb.com](https://koyeb.com)** and create a new **Service**.
2. Select **GitHub** as the source and choose your repository.
3. Builder: Choose **Dockerfile** (it will auto-detect root `Dockerfile`).
4. Set the same Environment Variables (`GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
5. Click **Deploy**. Your website is immediately accessible globally.
