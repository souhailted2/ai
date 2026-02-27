import { spawn } from "child_process";
import { storage } from "./storage";
import path from "path";
import fs from "fs";

const WORKSPACE_DIR = path.join(process.cwd(), "workspace", "projects");

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

const ALLOWED_COMMANDS = [
  "npm install",
  "npm run dev",
  "npm run build",
  "npm test",
  "npm run start",
  "npm run lint",
];

const COMMAND_TIMEOUT = 30000;

export interface RunnerOutput {
  type: "stdout" | "stderr" | "exit" | "error";
  data: string;
  timestamp: number;
}

export async function exportProjectToDisk(projectId: string): Promise<string> {
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");

  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || projectId.slice(0, 8);
  const projectDir = path.join(WORKSPACE_DIR, slug);

  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true });
  }
  fs.mkdirSync(projectDir, { recursive: true });

  const files = await storage.getProjectFiles(projectId);
  for (const file of files) {
    const filePath = path.join(projectDir, file.path);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.content, "utf-8");
  }

  return slug;
}

export function listProjectFilesOnDisk(slug: string): string[] {
  const projectDir = path.join(WORKSPACE_DIR, slug);
  if (!fs.existsSync(projectDir)) return [];

  const results: string[] = [];
  function walk(dir: string, prefix: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) {
        results.push(rel + "/");
        walk(path.join(dir, entry.name), rel);
      } else {
        results.push(rel);
      }
    }
  }
  walk(projectDir, "");
  return results;
}

export function readProjectFileFromDisk(slug: string, filePath: string): string | null {
  const fullPath = path.join(WORKSPACE_DIR, slug, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(WORKSPACE_DIR))) return null;
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, "utf-8");
}

export function writeProjectFileToDisk(slug: string, filePath: string, content: string): boolean {
  const fullPath = path.join(WORKSPACE_DIR, slug, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(WORKSPACE_DIR))) return false;
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, "utf-8");
  return true;
}

export function runCommand(
  slug: string,
  command: string,
  onOutput: (output: RunnerOutput) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const normalized = command.trim().toLowerCase();
    if (!ALLOWED_COMMANDS.some(allowed => normalized.startsWith(allowed))) {
      onOutput({ type: "error", data: `Command not allowed: ${command}\nAllowed: ${ALLOWED_COMMANDS.join(", ")}`, timestamp: Date.now() });
      resolve(1);
      return;
    }

    const projectDir = path.join(WORKSPACE_DIR, slug);
    if (!fs.existsSync(projectDir)) {
      onOutput({ type: "error", data: `Project directory not found: ${slug}`, timestamp: Date.now() });
      resolve(1);
      return;
    }

    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    onOutput({ type: "stdout", data: `$ ${command}\n`, timestamp: Date.now() });

    const child = spawn(cmd, args, {
      cwd: projectDir,
      shell: true,
      env: { ...process.env, NODE_ENV: "development" },
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      onOutput({ type: "error", data: "\nProcess timed out after 30 seconds", timestamp: Date.now() });
    }, COMMAND_TIMEOUT);

    child.stdout.on("data", (data) => {
      onOutput({ type: "stdout", data: data.toString(), timestamp: Date.now() });
    });

    child.stderr.on("data", (data) => {
      onOutput({ type: "stderr", data: data.toString(), timestamp: Date.now() });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      onOutput({ type: "error", data: `Process error: ${err.message}`, timestamp: Date.now() });
      resolve(1);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      onOutput({ type: "exit", data: `Process exited with code ${code}`, timestamp: Date.now() });
      resolve(code ?? 0);
    });
  });
}
