import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function patchParser() {
  const parserPath = path.resolve(
    rootDir,
    'node_modules/@langchain/langgraph-cli/dist/graph/parser/parser.mjs',
  );
  if (!fs.existsSync(parserPath)) return;
  let content = fs.readFileSync(parserPath, 'utf8');

  // Patch VFS paths
  const oldTarget = `        if (typeof target !== "string") {
            fsMap.set(targetPath, target.contents);
            for (const [name, contents] of target.files ?? []) {
                let tsFileName = path.resolve(dirname, name);
                // TS for some reason uses UNIX backslashes instead of the Window ones
                if (process.platform === "win32") {
                    tsFileName = tsFileName.replace(/\\\\/g, "/");
                }
                fsMap.set(tsFileName, contents);
            }
        }`;

  const newTarget = `        let normalizedTargetPath = targetPath;
        let normalizedInferTemplatePath = inferTemplatePath;
        if (process.platform === "win32") {
            normalizedTargetPath = normalizedTargetPath.replace(/\\\\/g, "/");
            normalizedInferTemplatePath = normalizedInferTemplatePath.replace(/\\\\/g, "/");
        }
        if (typeof target !== "string") {
            fsMap.set(targetPath, target.contents);
            fsMap.set(normalizedTargetPath, target.contents);
            for (const [name, contents] of target.files ?? []) {
                let tsFileName = path.resolve(dirname, name);
                if (process.platform === "win32") {
                    tsFileName = tsFileName.replace(/\\\\/g, "/");
                }
                fsMap.set(tsFileName, contents);
                fsMap.set(path.resolve(dirname, name), contents);
            }
        }`;

  if (content.includes(oldTarget)) {
    content = content.replace(oldTarget, newTarget);
  }

  const oldProgram = `        const research = ts.createProgram({
            rootNames: [inferTemplatePath, targetPath],
            options: compilerOptions,
            host: host.compilerHost,
        });
        const extractor = new SubgraphExtractor(research, research.getSourceFile(targetPath), research.getSourceFile(inferTemplatePath), options);
        const { files, exports } = extractor.getAugmentedSourceFile(name);
        for (const [name, source] of files) {
            system.writeFile(path.resolve(dirname, name), source);
        }
        const extract = ts.createProgram({
            rootNames: [path.resolve(dirname, "./__langraph__infer.mts")],
            options: compilerOptions,
            host: host.compilerHost,
        });`;

  const newProgram = `        const research = ts.createProgram({
            rootNames: [inferTemplatePath, targetPath, normalizedInferTemplatePath, normalizedTargetPath],
            options: compilerOptions,
            host: host.compilerHost,
        });
        const targetSource = research.getSourceFile(targetPath) || research.getSourceFile(normalizedTargetPath);
        const inferSource = research.getSourceFile(inferTemplatePath) || research.getSourceFile(normalizedInferTemplatePath);
        const extractor = new SubgraphExtractor(research, targetSource, inferSource, options);
        const { files, exports } = extractor.getAugmentedSourceFile(name);
        for (const [name, source] of files) {
            const rawPath = path.resolve(dirname, name);
            const normPath = process.platform === "win32" ? rawPath.replace(/\\\\/g, "/") : rawPath;
            system.writeFile(rawPath, source);
            system.writeFile(normPath, source);
            fsMap.set(rawPath, source);
            fsMap.set(normPath, source);
        }
        const inferMtsPath = path.resolve(dirname, "./__langraph__infer.mts");
        const normInferMtsPath = process.platform === "win32" ? inferMtsPath.replace(/\\\\/g, "/") : inferMtsPath;
        const extract = ts.createProgram({
            rootNames: [inferMtsPath, normInferMtsPath],
            options: compilerOptions,
            host: host.compilerHost,
        });`;

  if (content.includes(oldProgram)) {
    content = content.replace(oldProgram, newProgram);
  }

  fs.writeFileSync(parserPath, content, 'utf8');
  console.log(
    '[patch] Patched @langchain/langgraph-cli parser.mjs successfully.',
  );
}

function patchLogging() {
  const loggingPath = path.resolve(
    rootDir,
    'node_modules/@langchain/langgraph-cli/dist/logging.mjs',
  );
  if (!fs.existsSync(loggingPath)) return;
  let content = fs.readFileSync(loggingPath, 'utf8');

  const oldLogging = `        const highlightCode = process.stdout.isTTY;
        let codeFrame = codeFrameColumns(readFileSync(filePath, "utf-8"), { start: { line, column } }, { highlightCode });
        codeFrame = codeFrame
            .split("\\n")
            .map((i) => padding + i + "\\x1b[0m")
            .join("\\n");`;

  const newLogging = `        let resolvedPath = filePath;
        if (resolvedPath.startsWith("file://")) {
            try {
                resolvedPath = new URL(resolvedPath).pathname;
                if (process.platform === "win32" && resolvedPath.startsWith("/")) {
                    resolvedPath = resolvedPath.slice(1);
                }
            } catch {}
        }
        let codeFrame = "";
        try {
            codeFrame = codeFrameColumns(readFileSync(resolvedPath, "utf-8"), { start: { line, column } }, { highlightCode });
            codeFrame = codeFrame
                .split("\\n")
                .map((i) => padding + i + "\\x1b[0m")
                .join("\\n");
        } catch {
            return stack;
        }`;

  if (content.includes(oldLogging)) {
    content = content.replace(oldLogging, newLogging);
    fs.writeFileSync(loggingPath, content, 'utf8');
    console.log(
      '[patch] Patched @langchain/langgraph-cli logging.mjs successfully.',
    );
  }
}

function patchIPC() {
  const ipcPath = path.resolve(
    rootDir,
    'node_modules/@langchain/langgraph-cli/dist/cli/utils/ipc/client.mjs',
  );
  if (!fs.existsSync(ipcPath)) return;
  let content = fs.readFileSync(ipcPath, 'utf8');

  if (!content.includes('setTimeout(() => done(undefined), 300)')) {
    const newIPC = `import net from "node:net";
import { getPipePath } from "./utils/get-pipe-path.mjs";

export const connectToServer = (processId = process.ppid) => new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
        if (!resolved) {
            resolved = true;
            resolve(val);
        }
    };
    const timer = setTimeout(() => done(undefined), 300);
    try {
        const pipePath = getPipePath(processId);
        const socket = net.createConnection(pipePath, () => {
            clearTimeout(timer);
            const sendToParent = (data) => {
                try {
                    const messageBuffer = Buffer.from(JSON.stringify(data));
                    const lengthBuffer = Buffer.alloc(4);
                    lengthBuffer.writeInt32BE(messageBuffer.length, 0);
                    socket.write(Buffer.concat([lengthBuffer, messageBuffer]));
                } catch {}
            };
            done(sendToParent);
        });
        socket.on("error", () => {
            clearTimeout(timer);
            done(undefined);
        });
        socket.unref();
    } catch {
        clearTimeout(timer);
        done(undefined);
    }
});
`;
    fs.writeFileSync(ipcPath, newIPC, 'utf8');
    console.log(
      '[patch] Patched @langchain/langgraph-cli IPC client.mjs successfully.',
    );
  }
}

function patchDevNode() {
  const devNodePath = path.resolve(
    rootDir,
    'node_modules/@langchain/langgraph-cli/dist/cli/dev.node.mjs',
  );
  if (!fs.existsSync(devNodePath)) return;
  let content = fs.readFileSync(devNodePath, 'utf8');

  if (
    content.includes('"watch",') ||
    !content.includes('cwd: options.projectCwd')
  ) {
    const newDevNode = `import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {} from "../utils/config.mjs";
export async function spawnNodeServer(args, context, options) {
    const localUrl = \`http://\${args.host}:\${args.port}\`;
    const studioUrl = \`https://smith.langchain.com/studio?baseUrl=\${localUrl}\`;
    console.log(\`
          Welcome to

╦  ┌─┐┌┐┌┌─┐╔═╗┬─┐┌─┐┌─┐┬ ┬
║  ├─┤││││ ┬║ ╦├┬┘├─┤├─┘├─┤
╩═╝┴ ┴┘└┘└─┘╚═╝┴└─┴ ┴┴  ┴ ┴.js

- 🚀 API: \\x1b[36m\${localUrl}\\x1b[0m
- 🎨 Studio UI: \\x1b[36m\${studioUrl}\\x1b[0m

This in-memory server is designed for development and testing.
For production use, please use LangGraph Cloud.

\`);
    return spawn(process.execPath, [
        fileURLToPath(new URL("../../cli.mjs", import.meta.resolve("tsx/esm/api"))),
        fileURLToPath(new URL(import.meta.resolve("./dev.node.entrypoint.mjs"))),
        options.pid.toString(),
        JSON.stringify({
            port: Number.parseInt(args.port, 10),
            nWorkers: Number.parseInt(args.nJobsPerWorker, 10),
            host: args.host,
            graphs: context.config.graphs,
            cwd: options.projectCwd,
        }),
    ], { stdio: "inherit", env: context.env, cwd: options.projectCwd });
}
`;
    fs.writeFileSync(devNodePath, newDevNode, 'utf8');
    console.log(
      '[patch] Patched @langchain/langgraph-cli dev.node.mjs successfully.',
    );
  }
}

patchParser();
patchLogging();
patchIPC();
patchDevNode();
