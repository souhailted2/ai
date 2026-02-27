import vm from "vm";
import { toolRegistry, type ToolResult, type ToolInfo } from "../tools/registry";
import { isCloudMode, generateResponseWithLLM } from "../../llm-router";
import { buildCloudSystemPrompt, buildNextStepPrompt } from "../prompts/manus";

export interface CodeActResult {
  code: string;
  output: string;
  artifacts: string[];
  error?: string;
  toolsCalled: string[];
}

export class CodeActEngine {
  async generateCode(task: string, context: string, availableTools: ToolInfo[]): Promise<string> {
    if (isCloudMode()) {
      const llmCode = await this.generateWithLLM(task, context, availableTools);
      if (llmCode) return llmCode;
    }
    return this.generateOffline(task, context, availableTools);
  }

  async executeCode(code: string, projectSlug: string, timeout: number = 10000): Promise<CodeActResult> {
    const logs: string[] = [];
    const errors: string[] = [];
    const artifacts: string[] = [];
    const toolsCalled: string[] = [];

    const toolFunctions: Record<string, Function> = {};
    const tools = toolRegistry.listTools();
    for (const tool of tools) {
      const toolDef = toolRegistry.get(tool.name);
      if (toolDef) {
        toolFunctions[tool.name] = async (args: any) => {
          toolsCalled.push(tool.name);
          const enrichedArgs = { ...args };
          if (tool.name === "shell" || tool.name === "readFile" || tool.name === "writeFile" || tool.name === "listFiles" || tool.name === "deleteFile") {
            if (!enrichedArgs.slug && projectSlug) {
              enrichedArgs.slug = projectSlug;
            }
          }
          const result = await toolDef.handler(enrichedArgs);
          if (result.artifacts) artifacts.push(...result.artifacts);
          return result;
        };
      }
    }

    const sandbox: Record<string, any> = {
      console: {
        log: (...args: any[]) => logs.push(args.map(String).join(" ")),
        error: (...args: any[]) => errors.push(args.map(String).join(" ")),
        warn: (...args: any[]) => logs.push("[warn] " + args.map(String).join(" ")),
        info: (...args: any[]) => logs.push("[info] " + args.map(String).join(" ")),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      ...toolFunctions,
      require: undefined,
      process: undefined,
      global: undefined,
      globalThis: undefined,
      __dirname: undefined,
      __filename: undefined,
    };

    try {
      const context = vm.createContext(sandbox);
      const wrappedCode = `(async () => { ${code} })()`;
      const script = new vm.Script(wrappedCode, { filename: "codeact-exec.js" });
      const resultPromise = script.runInContext(context, { timeout: Math.min(timeout, 30000) });

      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`CodeAct execution timed out after ${timeout}ms`)), timeout)
        ),
      ]);

      const output = logs.join("\n");
      const errorOutput = errors.join("\n");

      let finalOutput = output;
      if (result !== undefined && result !== null) {
        const resultStr = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
        finalOutput = finalOutput ? `${finalOutput}\n=> ${resultStr}` : `=> ${resultStr}`;
      }
      if (errorOutput) {
        finalOutput = finalOutput ? `${finalOutput}\n[stderr] ${errorOutput}` : `[stderr] ${errorOutput}`;
      }

      return {
        code,
        output: finalOutput || "(no output)",
        artifacts,
        error: errors.length > 0 ? errorOutput : undefined,
        toolsCalled,
      };
    } catch (err: any) {
      return {
        code,
        output: logs.join("\n") || "",
        artifacts,
        error: err.message,
        toolsCalled,
      };
    }
  }

  private async generateWithLLM(task: string, context: string, availableTools: ToolInfo[]): Promise<string | null> {
    const systemPrompt = buildCloudSystemPrompt(availableTools);
    const prompt = context ? `Task: ${task}\n\nContext:\n${context}` : `Task: ${task}`;
    return generateResponseWithLLM(prompt, systemPrompt);
  }

  private generateOffline(task: string, context: string, availableTools: ToolInfo[]): string {
    const lower = task.toLowerCase();
    const toolNames = availableTools.map(t => t.name);

    if (this.matchesAny(lower, ["list files", "show files", "عرض الملفات", "الملفات", "fichiers"])) {
      return `const result = await listFiles({ slug: "__SLUG__" });
console.log("Project files:", result.output);`;
    }

    if (this.matchesAny(lower, ["read file", "open file", "اقرأ", "افتح", "ouvrir"])) {
      const fileMatch = task.match(/(?:read|open|اقرأ|افتح|ouvrir)\s+(.+)/i);
      const fileName = fileMatch?.[1]?.trim() || "index.html";
      return `const result = await readFile({ slug: "__SLUG__", filePath: "${fileName}" });
console.log("File content:", result.output);`;
    }

    if (this.matchesAny(lower, ["write file", "create file", "اكتب", "أنشئ", "créer"])) {
      return `const result = await writeFile({ slug: "__SLUG__", filePath: "output.txt", content: "Generated content" });
console.log("Write result:", result.output);`;
    }

    if (this.matchesAny(lower, ["search", "بحث", "ابحث", "chercher", "find online"])) {
      const queryMatch = task.match(/(?:search|بحث|ابحث|chercher|find)\s+(?:for|عن|about|sur)?\s*(.+)/i);
      const query = queryMatch?.[1]?.trim() || task;
      return `const result = await searchWeb({ query: "${query.replace(/"/g, '\\"')}" });
console.log("Search results:", result.output);`;
    }

    if (this.matchesAny(lower, ["run", "execute", "شغل", "نفذ", "exécuter", "npm"])) {
      const cmdMatch = task.match(/(?:run|execute|شغل|نفذ)\s+(.+)/i);
      const command = cmdMatch?.[1]?.trim() || "npm run build";
      return `const result = await shell({ slug: "__SLUG__", command: "${command.replace(/"/g, '\\"')}" });
console.log("Command output:", result.output);
if (result.error) console.error("Error:", result.error);`;
    }

    if (this.matchesAny(lower, ["calculate", "compute", "حساب", "احسب", "calculer"])) {
      return `const data = [1, 2, 3, 4, 5];
const sum = data.reduce((a, b) => a + b, 0);
const avg = sum / data.length;
console.log("Sum:", sum, "Average:", avg);`;
    }

    if (this.matchesAny(lower, ["fetch", "download", "تحميل", "جلب", "télécharger"])) {
      const urlMatch = task.match(/https?:\/\/[^\s]+/);
      const url = urlMatch?.[0] || "https://example.com";
      return `const result = await fetchUrl({ url: "${url}" });
console.log("Fetched content:", result.output.substring(0, 500));`;
    }

    return `console.log("Task: ${task.replace(/"/g, '\\"')}");
const files = await listFiles({ slug: "__SLUG__" });
console.log("Available files:", files.output);
console.log("Task analysis complete. Ready for further instructions.");`;
  }

  private matchesAny(text: string, keywords: string[]): boolean {
    return keywords.some(k => text.includes(k));
  }
}

export const codeActEngine = new CodeActEngine();
