FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY scripts ./scripts

RUN yarn install --frozen-lockfile --ignore-engines

# Copy full source
COPY backend ./backend
COPY frontend ./frontend

# Build both backend and frontend for production
RUN yarn build

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV LANGGRAPH_API_URL=http://127.0.0.1:2024
ENV LANGGRAPH_RETRIEVAL_ASSISTANT_ID=retrieval_graph
ENV LANGGRAPH_INGESTION_ASSISTANT_ID=ingestion_graph

CMD ["yarn", "start"]
