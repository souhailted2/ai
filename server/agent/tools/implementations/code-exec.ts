import { z } from "zod";
import vm from "vm";
import type { ToolResult } from "../registry";

const codeExecSchema = z.object({
  code: z.string().describe("JavaScript code to execute"),
  timeout: z.number().optional().default(5000).describe("Execution timeout in milliseconds (default 5000)"),
});

export const codeExecDescription = "Execute JavaScript/TypeScript snippets in a sandboxed vm context with timeout enforcement";

export async function codeExecHandler(args: z.infer<typeof codeExecSchema>): Promise<ToolResult> {
  const maxTimeout = 30000;
  const timeout = Math.min(args.timeout, maxTimeout);

  const logs: string[] = [];
  const errors: string[] = [];
  const artifacts: string[] = [];

  const sandbox = {
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
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    require: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
    __dirname: undefined,
    __filename: undefined,
  };

  try {
    const context = vm.createContext(sandbox);
    const script = new vm.Script(args.code, { filename: "agent-code.js" });
    const result = script.runInContext(context, { timeout });

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
      success: errors.length === 0,
      output: finalOutput || "(no output)",
      error: errors.length > 0 ? errorOutput : undefined,
      artifacts,
    };
  } catch (err: any) {
    const output = logs.join("\n");
    let errorMsg = err.message;
    if (err.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
      errorMsg = `Execution timed out after ${timeout}ms`;
    }

    return {
      success: false,
      output: output || "",
      error: errorMsg,
    };
  }
}

export { codeExecSchema };
