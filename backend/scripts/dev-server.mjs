import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { startServer } from '@langchain/langgraph-cli/dist/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

const port = process.env.LANGGRAPH_PORT
  ? parseInt(process.env.LANGGRAPH_PORT, 10)
  : 2024;
const host = process.env.LANGGRAPH_HOST || '0.0.0.0';

// Automatically free port if held by a previous stale process on Windows
if (process.platform === 'win32') {
  try {
    const netstatOutput = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lines = netstatOutput.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== String(process.pid)) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {}
      }
    }
  } catch {}
}

console.log(`Starting LangGraph server on http://${host}:${port}...`);

try {
  const { host: serverHost } = await startServer({
    port,
    nWorkers: 4,
    host,
    cwd: backendDir,
    graphs: {
      ingestion_graph: './dist/src/ingestion_graph/graph.js:graph',
      retrieval_graph: './dist/src/retrieval_graph/graph.js:graph',
    },
  });
  console.log(`LangGraph server ready and listening on http://${serverHost}`);
} catch (error) {
  console.error('Failed to start LangGraph server:', error);
  process.exit(1);
}
