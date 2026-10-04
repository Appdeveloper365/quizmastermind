// Local-only CLI harness — uses Ollama directly, NO cloud API keys, NO Copilot
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  provider: process.env.CONTINUITY_PROVIDER || "ollama",
  model: process.env.CONTINUITY_MODEL || "tinyllama",
  baseUrl: (process.env.CONTINUITY_BASE_URL || "http://localhost:11434").replace(/\/+$/, ""),
  workspace: process.argv.find((a) => a.startsWith("--workspace="))?.split("=")[1] || process.env.WORKSPACE || ".",
  yolo: !process.argv.includes("--no-yolo"),
};

const promptEq = process.argv.find((a) => a.startsWith("--prompt="));
const prompt = (promptEq ? promptEq.slice("--prompt=".length) : process.argv.filter((a) => !a.startsWith("--")).join(" ").trim())
  || "List the workspace files and summarize what this project does.";

const workspacePath = path.resolve(config.workspace);

console.log(`\n=== Local AI Coding Agent (No Cloud/Copilot) ===`);
console.log(`Provider: ${config.provider} | Model: ${config.model} | Endpoint: ${config.baseUrl}`);
console.log(`Workspace: ${workspacePath} | Auto-run: ${config.yolo ? "ON" : "OFF"}`);
console.log(`Prompt: ${prompt}\n`);

// Check Ollama
try {
  execSync(`curl -s http://localhost:11434/api/tags`, { stdio: "pipe" });
  console.log("✓ Ollama running locally\n");
} catch {
  console.error("✗ Ollama not running. Start: ollama serve");
  process.exit(1);
}

async function generateWithLocal(prompt, workspace) {
  const systemPrompt = `You are a coding assistant. Work dir: ${workspace}.
Rules: Analyze first, write clean code, keep changes minimal.
To write a file, output: ---WRITEFILE: path/to/file---
followed by code in triple backticks.
To read a file, output: ---READFILE: path/to/file---`;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  // Use Ollama's native /api/chat endpoint
  const requestBody = JSON.stringify({
    model: config.model,
    messages: messages,
    stream: false
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
  
  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      signal: controller.signal
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    return result.message?.content || result.response || JSON.stringify(result);
  } finally {
    clearTimeout(timeoutId);
  }
}

function writeFile(filePath, content) {
  const fullPath = path.resolve(workspacePath, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  console.log(`✓ Wrote: ${filePath}`);
}

function readFile(filePath) {
  const fullPath = path.resolve(workspacePath, filePath);
  if (!existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`);
  return readFileSync(fullPath, 'utf-8');
}

function parseFileOperations(text) {
  const ops = [];
  const writeRegex = /---WRITEFILE:\s*([^\n]+)---([\s\S]*?)```/gi;
  let match;
  while ((match = writeRegex.exec(text)) !== null) {
    ops.push({ action: "write", path: match[1].trim(), content: match[2].trim() });
  }
  return ops;
}

async function main() {
  try {
    console.log("Generating response from local Ollama...\n");
    const response = await generateWithLocal(prompt, workspacePath);
    console.log("=== Response ===\n" + response + "\n=== End ===\n");
    
    const ops = parseFileOperations(response);
    for (const op of ops) {
      if (config.yolo) {
        writeFile(op.path, op.content);
      } else {
        console.log(`[--no-yolo] Would write: ${op.path}`);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();