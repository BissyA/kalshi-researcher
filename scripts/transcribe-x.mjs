#!/usr/bin/env node
// X broadcast transcription worker.
// Spawned detached from the Next.js API route — runs independently of the dev server.
// Usage: node scripts/transcribe-x.mjs <transcriptId> <url> [--cookies-from-browser]

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, readdir } from "node:fs/promises";
import { existsSync, openSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// Open our own log file and route stdout/stderr to it.
// We do NOT inherit file descriptors from the parent (Next.js dev server) because
// those would close when the dev server restarts, sending EPIPE/SIGPIPE to this child.
try {
  const logPath = path.join(REPO_ROOT, "logs", "transcribe-x.log");
  const logFd = openSync(logPath, "a");
  const fs = await import("node:fs");
  const origWrite = (chunk, enc, cb) => {
    const s = typeof chunk === "string" ? chunk : chunk.toString(enc || "utf8");
    fs.writeSync(logFd, `[${new Date().toISOString()}] ${s}`);
    if (typeof cb === "function") cb();
    return true;
  };
  process.stdout.write = origWrite;
  process.stderr.write = origWrite;
} catch {
  // non-fatal — worker continues, just without log-file output
}

// Load .env.local manually (we're not running through Next.js)
const envPath = path.join(REPO_ROOT, ".env.local");
if (existsSync(envPath)) {
  const envText = await readFile(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("[worker] Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const LOCK_DIR = path.join(os.tmpdir(), "kalshi-whisper");
const LOCK_FILE = path.join(LOCK_DIR, ".lock");

const YT_DLP = "/opt/homebrew/bin/yt-dlp";
const WHISPER = path.join(os.homedir(), ".local/bin/whisper-ctranslate2");

const [, , transcriptId, url, ...flags] = process.argv;
const useCookies = flags.includes("--cookies-from-browser");

if (!transcriptId || !url) {
  console.error("[worker] Usage: transcribe-x.mjs <transcriptId> <url> [--cookies-from-browser]");
  process.exit(1);
}

const workDir = path.join(LOCK_DIR, transcriptId);

let lastProgressWrite = 0;
async function updateProgress(progress) {
  const now = Date.now();
  if (now - lastProgressWrite < 3000) return; // throttle to every 3s
  lastProgressWrite = now;
  await supabase
    .from("transcripts")
    .update({ transcription_progress: progress })
    .eq("id", transcriptId);
}

async function setStatus(status, extras = {}) {
  const { error } = await supabase
    .from("transcripts")
    .update({ transcription_status: status, ...extras })
    .eq("id", transcriptId);
  if (error) console.error("[worker] DB update failed:", error.message);
}

async function fail(message) {
  console.error("[worker] FAIL:", message);
  await setStatus("failed", { transcription_error: message });
  // Release lock before exiting — process.exit bypasses finally blocks
  try {
    await rm(LOCK_FILE, { force: true });
  } catch {}
  // Keep workDir for debugging on failure
  process.exit(1);
}

function runProc(cmd, args, onStderr) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdoutTail = "";
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Cap retained stderr to avoid memory blowup on long downloads
      if (stderr.length > 20000) stderr = stderr.slice(-10000);
      if (onStderr) onStderr(text);
    });
    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutTail += text;
      if (stdoutTail.length > 5000) stdoutTail = stdoutTail.slice(-3000);
      if (onStderr) onStderr(text);
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const combined = (stderr + "\n" + stdoutTail).trim();
        const err = new Error(
          `${cmd} exited (code=${code} signal=${signal}): ${combined.slice(-1000)}`
        );
        // @ts-ignore
        err.stderr = stderr;
        // @ts-ignore
        err.signal = signal;
        reject(err);
      }
    });
  });
}

function classifyYtDlpError(msg) {
  const lower = msg.toLowerCase();
  // Check for "ERROR:" lines from yt-dlp — those are the real failures
  const errorLine = msg.match(/ERROR:\s+(.+)/i);
  const errorText = (errorLine ? errorLine[1] : "").toLowerCase();

  if (errorText.includes("private") || errorText.includes("login required") || errorText.includes("sign in")) {
    return "Content is private or requires login. Try enabling 'Use browser cookies' (login to X in Brave first).";
  }
  if (errorText.includes("unavailable") || errorText.includes("does not exist") || errorText.includes("not found") || errorText.includes("no video formats")) {
    return "Broadcast is unavailable or deleted.";
  }
  if (errorText.includes("is live") || errorText.includes("livestream") || errorText.includes("still live")) {
    return "Live broadcasts still in progress cannot be transcribed. Wait until the broadcast ends.";
  }
  if (errorText.includes("geo") || errorText.includes("region") || errorText.includes("country")) {
    return "Broadcast is geo-blocked.";
  }
  // No explicit ERROR: line — return a generic message with the last bit of stderr for debugging
  return `Download failed: ${msg.slice(-400)}`;
}

async function cleanupStaleWorkdirs() {
  try {
    if (!existsSync(LOCK_DIR)) return;
    const entries = await readdir(LOCK_DIR, { withFileTypes: true });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const p = path.join(LOCK_DIR, entry.name);
      const stat = await readFile(path.join(p, ".stat")).catch(() => null);
      // Simple heuristic: ignore dirs older than 24h
      try {
        const s = (await import("node:fs/promises")).stat(p);
        const ss = await s;
        if (ss.mtimeMs < cutoff) {
          await rm(p, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // best-effort cleanup
  }
}

async function main() {
  await mkdir(LOCK_DIR, { recursive: true });
  await cleanupStaleWorkdirs();

  // Simple lockfile — refuse if another transcription is in progress
  if (existsSync(LOCK_FILE)) {
    const lockContents = await readFile(LOCK_FILE, "utf8").catch(() => "");
    // Check if lock is stale (>60 min)
    const lockAge = Date.now() - parseInt(lockContents || "0", 10);
    if (lockAge < 60 * 60 * 1000) {
      await fail(
        "Another transcription is in progress. Please wait for it to finish before starting another."
      );
      return;
    }
    // Stale lock — take over
  }
  await (await import("node:fs/promises")).writeFile(LOCK_FILE, String(Date.now()));

  try {
    await mkdir(workDir, { recursive: true });

    // ── Phase 1: download audio ────────────────────────────────────
    await setStatus("downloading", {
      transcription_progress: "Starting download...",
      transcription_error: null,
    });

    const audioOutput = path.join(workDir, "audio.%(ext)s");
    const ytArgs = [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--no-playlist",
      "-o",
      audioOutput,
    ];
    if (useCookies) {
      ytArgs.push("--cookies-from-browser", "brave");
    }
    ytArgs.push(url);

    console.log("[worker] yt-dlp", ytArgs.join(" "));
    try {
      await runProc(YT_DLP, ytArgs, (text) => {
        // Parse yt-dlp progress: "[download]  45.3% of 120MiB at 2.3MiB/s"
        const m = text.match(/\[download\]\s+([\d.]+%)\s+of\s+[\S]+/);
        if (m) updateProgress(`Downloading audio: ${m[1]}`);
        else if (text.includes("[ExtractAudio]")) updateProgress("Extracting audio...");
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await fail(classifyYtDlpError(msg));
      return;
    }

    // Find the produced audio file
    const files = await readdir(workDir);
    const audioFile = files.find((f) => f.startsWith("audio.") && /\.(mp3|m4a|wav|opus|webm)$/i.test(f));
    if (!audioFile) {
      await fail("Audio download completed but no audio file was produced.");
      return;
    }
    const audioPath = path.join(workDir, audioFile);

    // ── Phase 2: transcribe ────────────────────────────────────────
    await setStatus("transcribing", {
      transcription_progress: "Loading Whisper model (first run downloads ~3GB)...",
    });

    const whisperArgs = [
      audioPath,
      "--model", "large-v3",
      "--language", "en",
      "--output_dir", workDir,
      "--output_format", "txt",
      "--vad_filter", "True",
      "--compute_type", "auto",
      "--verbose", "True",
    ];

    console.log("[worker] whisper", whisperArgs.join(" "));
    try {
      await runProc(WHISPER, whisperArgs, (text) => {
        // Parse verbose output: "[00:12:34.000 --> 00:12:40.000] text..."
        const m = text.match(/\[(\d{2}:\d{2}:\d{2})\.\d+\s+-->\s+\d{2}:\d{2}:\d{2}\.\d+\]/);
        if (m) updateProgress(`Transcribing: ${m[1]}`);
        else if (text.includes("Detected language")) updateProgress("Language detected, transcribing...");
        else if (text.toLowerCase().includes("downloading")) updateProgress("Downloading Whisper model...");
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await fail(`Whisper transcription failed: ${msg.slice(0, 500)}`);
      return;
    }

    // Read the output txt (whisper names it after the input stem)
    const audioStem = audioFile.replace(/\.[^.]+$/, "");
    const txtPath = path.join(workDir, `${audioStem}.txt`);
    if (!existsSync(txtPath)) {
      await fail(`Whisper did not produce expected output file: ${txtPath}`);
      return;
    }

    const rawText = (await readFile(txtPath, "utf8"))
      .replace(/\s+/g, " ")
      .trim();

    if (rawText.length < 100) {
      await fail(`Transcript is too short (${rawText.length} chars) — may be silent or failed.`);
      return;
    }

    const wordCount = rawText.split(/\s+/).length;

    // ── Phase 3: persist and flip to pending ───────────────────────
    const { error: updateErr } = await supabase
      .from("transcripts")
      .update({
        full_text: rawText,
        raw_text: rawText,
        word_count: wordCount,
        transcription_status: "done",
        transcription_progress: `Complete: ${wordCount} words`,
        cleaning_status: "pending",
      })
      .eq("id", transcriptId);

    if (updateErr) {
      await fail(`DB write failed: ${updateErr.message}`);
      return;
    }

    console.log(`[worker] Success: ${wordCount} words for transcript ${transcriptId}`);

    // Cleanup workdir on success only
    await rm(workDir, { recursive: true, force: true });
  } finally {
    // Release lock
    await rm(LOCK_FILE, { force: true });
  }
}

main().catch(async (err) => {
  console.error("[worker] Uncaught:", err);
  const msg = err instanceof Error ? err.message : String(err);
  await setStatus("failed", { transcription_error: `Unexpected error: ${msg}` });
  // Release lock
  try {
    await rm(LOCK_FILE, { force: true });
  } catch {}
  process.exit(1);
});
