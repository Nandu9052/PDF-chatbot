import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function isObjectExported(filePath, objectName) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const exportRegex = new RegExp(
      `export\\s+(?:const|let|var)\\s+${objectName}\\s*=|export\\s+\\{[^}]*\\b${objectName}\\b[^}]*\\}`,
    );
    return exportRegex.test(fileContent);
  } catch (error) {
    console.error(`Error reading file ${filePath}: ${error.message}`);
    return false;
  }
}

function checkLanggraphPaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '..');

  let langgraphPath = path.join(rootDir, 'langgraph.json');
  let baseDir = rootDir;
  if (!fileExists(langgraphPath)) {
    langgraphPath = path.join(rootDir, 'backend', 'langgraph.json');
    baseDir = path.join(rootDir, 'backend');
  }

  if (!fileExists(langgraphPath)) {
    console.error('langgraph.json not found in root or backend directory');
    process.exit(1);
  }

  try {
    const langgraphContent = JSON.parse(fs.readFileSync(langgraphPath, 'utf8'));
    const graphs = langgraphContent.graphs;

    if (!graphs || typeof graphs !== 'object') {
      console.error('Invalid or missing "graphs" object in langgraph.json');
      process.exit(1);
    }

    let hasError = false;

    for (const [key, value] of Object.entries(graphs)) {
      const [filePath, objectName] = value.split(':');
      const fullPath = path.resolve(baseDir, filePath);

      if (!fileExists(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        hasError = true;
        continue;
      }

      if (!isObjectExported(fullPath, objectName)) {
        console.error(
          `Object "${objectName}" is not exported from ${fullPath}`,
        );
        hasError = true;
      }
    }

    if (hasError) {
      process.exit(1);
    } else {
      console.log(
        'All paths in langgraph.json are valid and objects are exported correctly.',
      );
    }
  } catch (error) {
    console.error(`Error parsing langgraph.json: ${error.message}`);
    process.exit(1);
  }
}

checkLanggraphPaths();
