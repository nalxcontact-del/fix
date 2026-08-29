import { readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "data", "runtime-control.json");

export function aiPaused() {
  try {
    const raw = readFileSync(file, "utf8");
    return JSON.parse(raw).aiPaused === true;
  } catch {
    return false;
  }
}

export function setAiPaused(value: boolean) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ aiPaused: value, updatedAt: Date.now() }), "utf8");
  renameSync(tmp, file);
  return value;
}
