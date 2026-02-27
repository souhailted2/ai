import { z } from "zod";
import type { ToolResult } from "../registry";
import path from "path";
import fs from "fs";

const WORKSPACE_DIR = path.resolve(path.join(process.cwd(), "workspace", "projects"));
const MAX_OUTPUT_CHARS = 16000;

const editHistory: Map<string, string[]> = new Map();

export const strReplaceEditorSchema = z.object({
  command: z.enum(["view", "create", "str_replace", "insert", "undo_edit"]).describe("Editor command"),
  filePath: z.string().describe("File path relative to workspace/projects/"),
  content: z.string().optional().describe("File content (for create)"),
  oldStr: z.string().optional().describe("Exact string to replace (for str_replace)"),
  newStr: z.string().optional().describe("Replacement string (for str_replace)"),
  insertLine: z.number().optional().describe("Line number to insert at (1-indexed, for insert)"),
  insertText: z.string().optional().describe("Text to insert (for insert)"),
  viewRange: z.array(z.number()).optional().describe("Line range [start, end] (1-indexed, for view)"),
});

export const strReplaceEditorDescription = "File editor with commands: view (cat -n), create (new file), str_replace (exact text replacement), insert (at line), undo_edit. Restricted to workspace/projects/.";

function resolveSafePath(filePath: string): string | null {
  const resolved = path.resolve(path.join(WORKSPACE_DIR, filePath));
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    return null;
  }
  return resolved;
}

function saveToHistory(fullPath: string, content: string): void {
  const key = fullPath;
  if (!editHistory.has(key)) {
    editHistory.set(key, []);
  }
  editHistory.get(key)!.push(content);
  if (editHistory.get(key)!.length > 50) {
    editHistory.get(key)!.shift();
  }
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  return output.substring(0, MAX_OUTPUT_CHARS) + "\n... [output truncated]";
}

export async function strReplaceEditorHandler(args: z.infer<typeof strReplaceEditorSchema>): Promise<ToolResult> {
  const { command, filePath } = args;

  const fullPath = resolveSafePath(filePath);
  if (!fullPath) {
    return { success: false, output: "", error: "Path traversal blocked. Path must be within workspace/projects/." };
  }

  switch (command) {
    case "view": {
      if (!fs.existsSync(fullPath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      let start = 0;
      let end = lines.length;
      if (args.viewRange && args.viewRange.length === 2) {
        start = Math.max(0, args.viewRange[0] - 1);
        end = Math.min(lines.length, args.viewRange[1]);
      }

      const numbered = lines
        .slice(start, end)
        .map((line, i) => `${String(start + i + 1).padStart(6)}\t${line}`)
        .join("\n");

      return { success: true, output: truncateOutput(numbered) };
    }

    case "create": {
      if (args.content === undefined) {
        return { success: false, output: "", error: "create requires content" };
      }
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(fullPath)) {
        saveToHistory(fullPath, fs.readFileSync(fullPath, "utf-8"));
      }
      fs.writeFileSync(fullPath, args.content, "utf-8");
      return { success: true, output: `File created: ${filePath}`, artifacts: [filePath] };
    }

    case "str_replace": {
      if (args.oldStr === undefined) {
        return { success: false, output: "", error: "str_replace requires oldStr" };
      }
      if (args.newStr === undefined) {
        return { success: false, output: "", error: "str_replace requires newStr" };
      }
      if (!fs.existsSync(fullPath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }
      const content = fs.readFileSync(fullPath, "utf-8");

      const occurrences = content.split(args.oldStr).length - 1;
      if (occurrences === 0) {
        return { success: false, output: "", error: `oldStr not found in ${filePath}. Make sure the string matches exactly (including whitespace and indentation).` };
      }
      if (occurrences > 1) {
        return { success: false, output: "", error: `oldStr found ${occurrences} times in ${filePath}. It must be unique. Add more surrounding context to make it unique.` };
      }

      saveToHistory(fullPath, content);
      const newContent = content.replace(args.oldStr, args.newStr);
      fs.writeFileSync(fullPath, newContent, "utf-8");

      const replaceLineNum = content.substring(0, content.indexOf(args.oldStr)).split("\n").length;
      return {
        success: true,
        output: `Replacement made at line ${replaceLineNum} in ${filePath}`,
        artifacts: [filePath],
      };
    }

    case "insert": {
      if (args.insertLine === undefined) {
        return { success: false, output: "", error: "insert requires insertLine" };
      }
      if (args.insertText === undefined) {
        return { success: false, output: "", error: "insert requires insertText" };
      }
      if (!fs.existsSync(fullPath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      saveToHistory(fullPath, content);

      const lines = content.split("\n");
      const lineIdx = Math.max(0, Math.min(lines.length, args.insertLine - 1));
      lines.splice(lineIdx, 0, args.insertText);
      const newContent = lines.join("\n");
      fs.writeFileSync(fullPath, newContent, "utf-8");
      return {
        success: true,
        output: `Text inserted at line ${args.insertLine} in ${filePath}`,
        artifacts: [filePath],
      };
    }

    case "undo_edit": {
      const history = editHistory.get(fullPath);
      if (!history || history.length === 0) {
        return { success: false, output: "", error: `No edit history for ${filePath}` };
      }
      const previousContent = history.pop()!;
      fs.writeFileSync(fullPath, previousContent, "utf-8");
      return {
        success: true,
        output: `Edit undone for ${filePath}. ${history.length} more undo(s) available.`,
        artifacts: [filePath],
      };
    }

    default:
      return { success: false, output: "", error: `Unknown command: ${command}` };
  }
}
