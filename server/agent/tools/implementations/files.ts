import { z } from "zod";
import type { ToolResult } from "../registry";
import {
  listProjectFilesOnDisk,
  readProjectFileFromDisk,
  writeProjectFileToDisk,
  exportProjectToDisk,
} from "../../../runner";
import path from "path";
import fs from "fs";

const WORKSPACE_DIR = path.join(process.cwd(), "workspace", "projects");

const readFileSchema = z.object({
  slug: z.string().describe("Project slug (directory name)"),
  filePath: z.string().describe("Relative file path within the project"),
});

const writeFileSchema = z.object({
  slug: z.string().describe("Project slug (directory name)"),
  filePath: z.string().describe("Relative file path within the project"),
  content: z.string().describe("File content to write"),
});

const listFilesSchema = z.object({
  slug: z.string().describe("Project slug (directory name)"),
});

const deleteFileSchema = z.object({
  slug: z.string().describe("Project slug (directory name)"),
  filePath: z.string().describe("Relative file path within the project"),
});

export const readFileDescription = "Read a file from the project workspace";
export const writeFileDescription = "Write/create a file in the project workspace";
export const listFilesDescription = "List all files in the project workspace";
export const deleteFileDescription = "Delete a file from the project workspace";

export async function readFileHandler(args: z.infer<typeof readFileSchema>): Promise<ToolResult> {
  const content = readProjectFileFromDisk(args.slug, args.filePath);
  if (content === null) {
    return { success: false, output: "", error: `File not found: ${args.filePath}` };
  }
  return { success: true, output: content };
}

export async function writeFileHandler(args: z.infer<typeof writeFileSchema>): Promise<ToolResult> {
  const ok = writeProjectFileToDisk(args.slug, args.filePath, args.content);
  if (!ok) {
    return { success: false, output: "", error: `Failed to write file: ${args.filePath} (path traversal blocked)` };
  }
  return { success: true, output: `File written: ${args.filePath}`, artifacts: [args.filePath] };
}

export async function listFilesHandler(args: z.infer<typeof listFilesSchema>): Promise<ToolResult> {
  const files = listProjectFilesOnDisk(args.slug);
  if (files.length === 0) {
    return { success: true, output: "No files found (project directory may not exist)" };
  }
  return { success: true, output: files.join("\n") };
}

export async function deleteFileHandler(args: z.infer<typeof deleteFileSchema>): Promise<ToolResult> {
  const fullPath = path.join(WORKSPACE_DIR, args.slug, args.filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(WORKSPACE_DIR))) {
    return { success: false, output: "", error: "Path traversal blocked" };
  }
  if (!fs.existsSync(resolved)) {
    return { success: false, output: "", error: `File not found: ${args.filePath}` };
  }
  fs.unlinkSync(resolved);
  return { success: true, output: `File deleted: ${args.filePath}` };
}

export { readFileSchema, writeFileSchema, listFilesSchema, deleteFileSchema };
