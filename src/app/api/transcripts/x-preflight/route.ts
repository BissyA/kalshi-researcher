import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

const YT_DLP = "/opt/homebrew/bin/yt-dlp";
const WHISPER = path.join(os.homedir(), ".local/bin/whisper-ctranslate2");

function checkVersion(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout.on("data", (c) => (out += c.toString()));
      proc.on("error", () => resolve(null));
      proc.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    } catch {
      resolve(null);
    }
  });
}

export async function GET() {
  const ytDlpPresent = existsSync(YT_DLP);
  const whisperPresent = existsSync(WHISPER);

  const missing: string[] = [];
  if (!ytDlpPresent) missing.push("yt-dlp (run: brew install yt-dlp)");
  if (!whisperPresent) {
    missing.push(
      "whisper-ctranslate2 (run: brew install pipx && pipx install whisper-ctranslate2)"
    );
  }

  const [ytDlpVersion, whisperVersion] = await Promise.all([
    ytDlpPresent ? checkVersion(YT_DLP) : Promise.resolve(null),
    whisperPresent ? checkVersion(WHISPER) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ready: missing.length === 0,
    missing,
    ytDlp: ytDlpVersion,
    whisper: whisperVersion,
  });
}
