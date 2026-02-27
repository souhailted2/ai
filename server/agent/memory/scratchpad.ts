import path from "path";
import fs from "fs";

const WORKSPACE_DIR = path.join(process.cwd(), "workspace", "scratchpad");

export interface CheckpointData {
  id: string;
  timestamp: number;
  planState: any;
}

export class Scratchpad {
  private projectId: string;
  private baseDir: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.baseDir = path.join(WORKSPACE_DIR, projectId);
    this.ensureDirs();
  }

  private ensureDirs(): void {
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, "notes"),
      path.join(this.baseDir, "drafts"),
      path.join(this.baseDir, ".checkpoints"),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private safePath(subPath: string): string {
    const resolved = path.resolve(path.join(this.baseDir, subPath));
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error("Path traversal detected");
    }
    return resolved;
  }

  writeTodo(items: string[]): void {
    const content = items.map((item, i) => `- [ ] ${item}`).join("\n");
    const filePath = this.safePath("todo.md");
    fs.writeFileSync(filePath, content, "utf-8");
  }

  readTodo(): string[] {
    const filePath = this.safePath("todo.md");
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").filter(line => line.trim().length > 0);
  }

  writeNote(name: string, content: string): void {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = this.safePath(`notes/${sanitized}.md`);
    fs.writeFileSync(filePath, content, "utf-8");
  }

  readNote(name: string): string | null {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = this.safePath(`notes/${sanitized}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  }

  writeDraft(name: string, content: string): void {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = this.safePath(`drafts/${sanitized}`);
    fs.writeFileSync(filePath, content, "utf-8");
  }

  readDraft(name: string): string | null {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = this.safePath(`drafts/${sanitized}`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  }

  saveCheckpoint(planState: any): string {
    const id = `cp_${Date.now()}`;
    const checkpoint: CheckpointData = {
      id,
      timestamp: Date.now(),
      planState,
    };
    const filePath = this.safePath(`.checkpoints/${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
    return id;
  }

  loadCheckpoint(id: string): CheckpointData | null {
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = this.safePath(`.checkpoints/${sanitized}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as CheckpointData;
    } catch {
      return null;
    }
  }

  listCheckpoints(): CheckpointData[] {
    const dir = this.safePath(".checkpoints");
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    const checkpoints: CheckpointData[] = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        checkpoints.push(JSON.parse(content));
      } catch {
        continue;
      }
    }
    checkpoints.sort((a, b) => b.timestamp - a.timestamp);
    return checkpoints;
  }

  listAll(): { todos: string[]; notes: string[]; drafts: string[]; checkpoints: string[] } {
    const result = {
      todos: this.readTodo(),
      notes: [] as string[],
      drafts: [] as string[],
      checkpoints: [] as string[],
    };

    const notesDir = this.safePath("notes");
    if (fs.existsSync(notesDir)) {
      result.notes = fs.readdirSync(notesDir).filter(f => f.endsWith(".md"));
    }

    const draftsDir = this.safePath("drafts");
    if (fs.existsSync(draftsDir)) {
      result.drafts = fs.readdirSync(draftsDir);
    }

    const checkpointsDir = this.safePath(".checkpoints");
    if (fs.existsSync(checkpointsDir)) {
      result.checkpoints = fs.readdirSync(checkpointsDir).filter(f => f.endsWith(".json"));
    }

    return result;
  }

  clear(): void {
    if (fs.existsSync(this.baseDir)) {
      fs.rmSync(this.baseDir, { recursive: true });
    }
    this.ensureDirs();
  }
}

export function createScratchpad(projectId: string): Scratchpad {
  return new Scratchpad(projectId);
}
