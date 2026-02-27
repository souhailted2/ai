import { z } from "zod";
import { toolRegistry } from "./registry";
import { shellHandler, shellSchema, shellToolDescription } from "./implementations/shell";
import { readFileHandler, readFileSchema, readFileDescription, writeFileHandler, writeFileSchema, writeFileDescription, listFilesHandler, listFilesSchema, listFilesDescription, deleteFileHandler, deleteFileSchema, deleteFileDescription } from "./implementations/files";
import { searchWebHandler, searchWebSchema, searchWebDescription, fetchUrlHandler, fetchUrlSchema, fetchUrlDescription } from "./implementations/web";
import { codeExecHandler, codeExecSchema, codeExecDescription } from "./implementations/code-exec";
import { planningHandler, planningSchema, planningDescription } from "./implementations/planning";
import { strReplaceEditorHandler, strReplaceEditorSchema, strReplaceEditorDescription } from "./implementations/str-replace-editor";
import { createToolHandler, createToolSchema, createToolDescription, toolBuilderAgent } from "../agents/tool-builder";
import { researchDocsHandler, researchDocsSchema, researchDocsDescription, researchGitHubHandler, researchGitHubSchema, researchGitHubDescription, researchWebHandler, researchWebSchema, researchWebDescription } from "../agents/research";

const askHumanSchema = z.object({
  question: z.string().describe("The question to ask the human user"),
});

const askHumanDescription = "Pause execution and ask the human user a question. The agent will wait for a response before continuing.";

async function askHumanHandler(args: { question: string }) {
  return {
    success: true,
    output: `[ASK_HUMAN]${args.question}[/ASK_HUMAN]`,
  };
}

let registered = false;

export function registerAllTools(): void {
  if (registered) return;
  registered = true;

  toolRegistry.register("shell", shellHandler, shellSchema, shellToolDescription);
  toolRegistry.register("readFile", readFileHandler, readFileSchema, readFileDescription);
  toolRegistry.register("writeFile", writeFileHandler, writeFileSchema, writeFileDescription);
  toolRegistry.register("listFiles", listFilesHandler, listFilesSchema, listFilesDescription);
  toolRegistry.register("deleteFile", deleteFileHandler, deleteFileSchema, deleteFileDescription);
  toolRegistry.register("searchWeb", searchWebHandler, searchWebSchema, searchWebDescription);
  toolRegistry.register("fetchUrl", fetchUrlHandler, fetchUrlSchema, fetchUrlDescription);
  toolRegistry.register("codeExec", codeExecHandler, codeExecSchema, codeExecDescription);
  toolRegistry.register("planning", planningHandler, planningSchema, planningDescription);
  toolRegistry.register("strReplaceEditor", strReplaceEditorHandler, strReplaceEditorSchema, strReplaceEditorDescription);
  toolRegistry.register("researchDocs", researchDocsHandler, researchDocsSchema, researchDocsDescription);
  toolRegistry.register("researchGitHub", researchGitHubHandler, researchGitHubSchema, researchGitHubDescription);
  toolRegistry.register("researchWeb", researchWebHandler, researchWebSchema, researchWebDescription);
  toolRegistry.register("createTool", createToolHandler, createToolSchema, createToolDescription);
  toolRegistry.register("askHuman", askHumanHandler, askHumanSchema, askHumanDescription);

  toolBuilderAgent.loadCustomTools();
}
