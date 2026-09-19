// auto-run CLI wrapper — TRUE auto fallback that works with your ClinePass API key.
// The direct-SDK Agent with providerId "cline-pass" needs extension OAuth, NOT a raw
// API key, so this wrapper shells out to the Cline CLI (which accepts CLINE_API_KEY)
// and auto-falls back best-first on quota/rate-limit errors.
//
// Prereqs: npm i -g cline   +   .env with CLINE_API_KEY (app.cline.bot > Settings > API Keys)
// Usage:
//   node auto-cline.mjs "Build quiz homepage with timer"
//   node auto-cline.mjs "Fix auth bug" --workspace ./my-app
//   node auto-cline.mjs --prompt="Hello" --yolo
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
import { existsSync } from "node:fs";

// Resolve Cline CLI (Windows: %APPDATA%\npm\cline.cmd, not on PATH by default).
// NOTE: .cmd needs shell:true (spawn EINVAL otherwise), so we run via cmd /c.
const CLINE_BIN =
  process.env.CLINE_BIN ||
  (process.platform === "win32"
    ? `${process.env.APPDATA}\\npm\\cline.cmd`
    : "cline");
const USE_SHELL = process.platform === "win32" && CLINE_BIN.endsWith(".cmd");
if (process.platform === "win32" && !existsSync(CLINE_BIN)) {
  console.error(`Cline CLI not found at ${CLINE_BIN}. Run: npm i -g cline`);
  process.exit(1);
}

// Excellence order, best first. Slugs (cline-pass/xxx) = REST/CLI form.
const FALLBACK_CHAIN = [
  { label: "Kimi K3 (best long-horizon)", model: "cline-pass/kimi-k3" },
  { label: "GLM 5.3 (best reasoning)", model: "cline-pass/glm-5.3" },
  { label: "Qwen 3.8 Max (complex coding)", model: "cline-pass/qwen3.8-max" },
  { label: "Qwen 3.7 Max", model: "cline-pass/qwen3.7-max" },
  { label: "DeepSeek V4 Pro", model: "cline-pass/deepseek-v4-pro" },
  { label: "MiMo V2.5 Pro", model: "cline-pass/mimo-v2.5-pro" },
  { label: "MiniMax M3 (best balance/fast)", model: "cline-pass/minimax-m3" },
  { label: "Kimi K2.7 Code", model: "cline-pass/kimi-k2.7-code" },
  { label: "GLM 5.2", model: "cline-pass/glm-5.2" },
  { label: "Qwen 3.7 Plus", model: "cline-pass/qwen3.7-plus" },
  { label: "Kimi K2.6", model: "cline-pass/kimi-k2.6" },
  { label: "DeepSeek V4 Flash", model: "cline-pass/deepseek-v4-flash" },
  { label: "MiMo V2.5 (efficient)", model: "cline-pass/mimo-v2.5" },
];

function continuityModel() {
  return process.env.CONTINUITY_MODEL || null; // e.g. minimax/minimax-m2.5 (FREE, separate quota)
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const workspace = process.argv.find((a) => a.startsWith("--workspace="))?.split("=")[1] || process.env.WORKSPACE || ".";
  const promptEq = process.argv.find((a) => a.startsWith("--prompt="));
  // Default ON: this harness is meant to auto-run. Pass --no-yolo to require approvals.
  const yolo = argv.includes("--no-yolo") ? false : true;
  const prompt = (promptEq ? promptEq.slice("--prompt=".length) : argv.filter((a) => !a.startsWith("--")).join(" ").trim())
    || "List the workspace files and summarize what this QuizMastermind project needs next.";
  return { prompt, workspace: path.resolve(workspace), yolo };
}

function isQuotaError(text) {
  const t = String(text || "").toLowerCase();
  return ["402", "429", "quota", "rate limit", "rate_limit", "insufficient", "payment required", "overloaded", "capacity", "clinepasslimit", "free model limit"].some((s) => t.includes(s));
}


async function runWithFallback(prompt, workspace, yolo) {
  const chain = [...FALLBACK_CHAIN];
  const cont = continuityModel();
  if (cont) chain.push({ label: `Continuity (${cont})`, model: cont });
  let lastError = null;
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    console.log(`\n[TRY ${i + 1}/${chain.length}] ${entry.label} (${entry.model}) ...`);
    // Headless: `cline --json -P cline -m <slug> -c <dir> --auto-approve <bool> "<multi-word prompt>"`
    // NOTE: prompt MUST be multiple words in ONE quoted arg (single word = "Unknown command").
    // --timeout 300 so a hung approval/model never blocks the fallback chain forever.
    const promptArg = prompt.replace(/\s+/g, " ").trim().slice(0, 4000) || "say hello now please";
    const args = ["--json", "-P", "cline", "-m", entry.model, "-c", workspace, "--auto-approve", String(yolo), "--timeout", "300", promptArg];
    try {
      // Windows .cmd: go through exec (string command) so quoting works.
      const { exec } = await import("node:child_process");
      const { promisify: prom } = await import("node:util");
      const execAsync = prom(exec);
      const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const cmd = USE_SHELL
        ? `${q(CLINE_BIN)} ${["--json", "-P", "cline", "-m", entry.model, "-c", workspace, "--auto-approve", String(yolo), promptArg].map(q).join(" ")}`
        : `${q(CLINE_BIN)} ${["--json", "-P", "cline", "-m", entry.model, "-c", workspace, "--auto-approve", String(yolo), promptArg].map((a) => (a.includes(" ") ? q(a) : a)).join(" ")}`;
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: workspace,
        timeout: 20 * 60 * 1000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, CLINE_API_KEY: process.env.CLINE_API_KEY || "" },
      });
      if (stderr) process.stderr.write(String(stderr).slice(0, 2000));
      // --json emits NDJSON lines; extract the final text for readability.
      let pretty = "";
      for (const line of String(stdout).split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) { if (t) pretty += t + "\n"; continue; }
        try {
          const obj = JSON.parse(t);
          const ev = obj.event || {};
          if (obj.type === "agent_event" && (ev.type === "content_end" || ev.type === "done") && ev.text) pretty += ev.text + "\n";
          else if (obj.type === "run_result" && obj.text) pretty += obj.text + "\n";
          else if (obj.type === "error") pretty += `ERROR: ${obj.message}\n`;
        } catch { /* keep raw */ }
      }
      console.log(`\nDONE with ${entry.label}.\n--- OUTPUT ---\n${pretty || stdout}\n`);
      return stdout;
    } catch (err) {
      const out = `${err?.stdout || ""}\n${err?.stderr || ""}\n${err?.message || err}`;
      lastError = new Error(out.slice(0, 2000));
      if (isQuotaError(out)) {
        console.log(`WARN ${entry.label}: quota/rate-limit hit. Auto-falling back to next best...`);
        continue;
      }
      console.log(`WARN ${entry.label}: ${String(err?.message || err).slice(0, 300)}. Next best...`);
    }
  }
  throw lastError || new Error("All fallback models exhausted.");
}

const { prompt, workspace, yolo } = parseArgs();
if (!process.env.CLINE_API_KEY) {
  console.error("Missing CLINE_API_KEY. Copy .env.example -> .env first (app.cline.bot > Settings > API Keys).");
  process.exit(1);
}
console.log(`Workspace: ${workspace}\nAuto-run: ${yolo ? "ON (auto-approve all tools)" : "OFF (--no-yolo, will ask approvals)"}`);
await runWithFallback(prompt, workspace, yolo);
