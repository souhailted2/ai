import { z } from "zod";
import fs from "fs";
import path from "path";
import vm from "vm";
import { toolRegistry } from "../tools/registry";
import type { ToolResult } from "../tools/registry";

const CUSTOM_TOOLS_DIR = path.resolve("workspace/custom-tools");

interface CustomToolMeta {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description?: string; required?: boolean }>;
  createdAt: string;
}

const TOOL_TEMPLATES: Record<string, { description: string; code: string; parameters: Record<string, { type: string; description: string; required: boolean }> }> = {
  "file-transformer": {
    description: "Reads a file, transforms its content, and writes the result",
    parameters: {
      inputPath: { type: "string", description: "Path to the input file", required: true },
      outputPath: { type: "string", description: "Path to the output file", required: true },
      transform: { type: "string", description: "Transformation type: uppercase, lowercase, trim, reverse", required: true },
    },
    code: `async function handler(args) {
  const fs = require("fs");
  const content = fs.readFileSync(args.inputPath, "utf-8");
  let result;
  switch (args.transform) {
    case "uppercase": result = content.toUpperCase(); break;
    case "lowercase": result = content.toLowerCase(); break;
    case "trim": result = content.split("\\n").map(l => l.trimEnd()).join("\\n"); break;
    case "reverse": result = content.split("\\n").reverse().join("\\n"); break;
    default: return { success: false, output: "", error: "Unknown transform: " + args.transform };
  }
  fs.writeFileSync(args.outputPath, result, "utf-8");
  return { success: true, output: "Transformed " + args.inputPath + " -> " + args.outputPath + " (" + args.transform + ")" };
}`,
  },
  "data-validator": {
    description: "Validates JSON data against a set of rules",
    parameters: {
      data: { type: "string", description: "JSON string to validate", required: true },
      rules: { type: "string", description: "Validation rules: required-fields, no-nulls, no-empty-strings", required: true },
    },
    code: `async function handler(args) {
  let parsed;
  try { parsed = JSON.parse(args.data); } catch(e) { return { success: false, output: "", error: "Invalid JSON: " + e.message }; }
  const errors = [];
  const rules = args.rules.split(",").map(r => r.trim());
  if (rules.includes("no-nulls")) {
    for (const [k, v] of Object.entries(parsed)) {
      if (v === null) errors.push("Field '" + k + "' is null");
    }
  }
  if (rules.includes("no-empty-strings")) {
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "") errors.push("Field '" + k + "' is empty string");
    }
  }
  if (errors.length > 0) return { success: false, output: errors.join("\\n"), error: "Validation failed" };
  return { success: true, output: "Validation passed. " + Object.keys(parsed).length + " fields checked." };
}`,
  },
  "api-caller": {
    description: "Makes an HTTP request and returns the response",
    parameters: {
      url: { type: "string", description: "URL to fetch", required: true },
      method: { type: "string", description: "HTTP method: GET, POST", required: true },
    },
    code: `async function handler(args) {
  try {
    const resp = await fetch(args.url, { method: args.method || "GET" });
    const text = await resp.text();
    const truncated = text.length > 8000 ? text.slice(0, 8000) + "...(truncated)" : text;
    return { success: resp.ok, output: truncated, error: resp.ok ? undefined : "HTTP " + resp.status };
  } catch(e) {
    return { success: false, output: "", error: e.message };
  }
}`,
  },
};

export class ToolBuilderAgent {
  async buildTool(
    name: string,
    description: string,
    logic: string,
    parameters?: Record<string, { type: string; description?: string; required?: boolean }>
  ): Promise<ToolResult> {
    if (!name || !name.match(/^[a-zA-Z][a-zA-Z0-9_-]*$/)) {
      return { success: false, output: "", error: "Invalid tool name. Must start with a letter and contain only letters, numbers, hyphens, and underscores." };
    }

    let toolCode = logic;
    let toolParams = parameters || {};
    let toolDescription = description;

    if (TOOL_TEMPLATES[logic]) {
      const template = TOOL_TEMPLATES[logic];
      toolCode = template.code;
      toolParams = template.parameters;
      toolDescription = description || template.description;
    }

    if (!toolCode.includes("async function handler")) {
      return { success: false, output: "", error: "Tool logic must contain an 'async function handler(args)' function." };
    }

    const meta: CustomToolMeta = {
      name,
      description: toolDescription,
      parameters: toolParams,
      createdAt: new Date().toISOString(),
    };

    const fileContent = `// Custom Tool: ${name}
// Description: ${toolDescription}
// Created: ${meta.createdAt}
// META:${JSON.stringify(meta)}

${toolCode}

module.exports = { handler, meta: ${JSON.stringify(meta)} };
`;

    try {
      if (!fs.existsSync(CUSTOM_TOOLS_DIR)) {
        fs.mkdirSync(CUSTOM_TOOLS_DIR, { recursive: true });
      }

      const filePath = path.join(CUSTOM_TOOLS_DIR, `${name}.js`);
      fs.writeFileSync(filePath, fileContent, "utf-8");

      this.registerCustomTool(name, toolDescription, toolCode, toolParams);

      return {
        success: true,
        output: `Tool '${name}' created successfully at workspace/custom-tools/${name}.js and registered in ToolRegistry.`,
        artifacts: [filePath],
      };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to create tool: ${err.message}` };
    }
  }

  private registerCustomTool(
    name: string,
    description: string,
    code: string,
    parameters: Record<string, { type: string; description?: string; required?: boolean }>
  ): void {
    const schemaShape: Record<string, z.ZodType<any>> = {};
    for (const [key, param] of Object.entries(parameters)) {
      let field: z.ZodType<any>;
      switch (param.type) {
        case "number": field = z.number(); break;
        case "boolean": field = z.boolean(); break;
        default: field = z.string(); break;
      }
      if (param.description) {
        field = (field as any).describe(param.description);
      }
      if (!param.required) {
        field = field.optional();
      }
      schemaShape[key] = field;
    }

    const schema = z.object(schemaShape);

    const handler = async (args: any): Promise<ToolResult> => {
      try {
        const wrappedCode = `${code}\nhandler(args);`;
        const sandbox = {
          args,
          console: {
            log: (...a: any[]) => {},
            error: (...a: any[]) => {},
            warn: (...a: any[]) => {},
            info: (...a: any[]) => {},
          },
          require: (mod: string) => {
            const allowed = ["fs", "path", "url", "querystring", "crypto", "util"];
            if (allowed.includes(mod)) {
              return require(mod);
            }
            throw new Error(`Module '${mod}' is not allowed in custom tools`);
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
          fetch: globalThis.fetch,
          parseInt,
          parseFloat,
        };

        const context = vm.createContext(sandbox);
        const script = new vm.Script(wrappedCode, { filename: `custom-tool-${name}.js` });
        const result = await script.runInContext(context, { timeout: 15000 });

        if (result && typeof result === "object" && "success" in result) {
          return result as ToolResult;
        }
        return { success: true, output: result !== undefined ? String(result) : "(no output)" };
      } catch (err: any) {
        return { success: false, output: "", error: `Custom tool error: ${err.message}` };
      }
    };

    toolRegistry.register(`custom_${name}`, handler, schema, description);
  }

  listCustomTools(): ToolResult {
    try {
      if (!fs.existsSync(CUSTOM_TOOLS_DIR)) {
        return { success: true, output: "No custom tools found." };
      }

      const files = fs.readdirSync(CUSTOM_TOOLS_DIR).filter(f => f.endsWith(".js"));
      if (files.length === 0) {
        return { success: true, output: "No custom tools found." };
      }

      const tools: CustomToolMeta[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(CUSTOM_TOOLS_DIR, file), "utf-8");
        const metaMatch = content.match(/\/\/ META:(.+)/);
        if (metaMatch) {
          try {
            tools.push(JSON.parse(metaMatch[1]));
          } catch {
            tools.push({ name: file.replace(".js", ""), description: "Unknown", parameters: {}, createdAt: "Unknown" });
          }
        }
      }

      const listing = tools.map(t =>
        `- ${t.name}: ${t.description} (created: ${t.createdAt})`
      ).join("\n");

      return { success: true, output: `Custom tools (${tools.length}):\n${listing}` };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to list tools: ${err.message}` };
    }
  }

  loadCustomTools(): ToolResult {
    try {
      if (!fs.existsSync(CUSTOM_TOOLS_DIR)) {
        return { success: true, output: "No custom tools directory found." };
      }

      const files = fs.readdirSync(CUSTOM_TOOLS_DIR).filter(f => f.endsWith(".js"));
      let loaded = 0;

      for (const file of files) {
        const content = fs.readFileSync(path.join(CUSTOM_TOOLS_DIR, file), "utf-8");
        const metaMatch = content.match(/\/\/ META:(.+)/);
        if (!metaMatch) continue;

        let meta: CustomToolMeta;
        try {
          meta = JSON.parse(metaMatch[1]);
        } catch {
          continue;
        }

        const codeMatch = content.match(/(async function handler[\s\S]*?)(?=\n\nmodule\.exports)/);
        if (!codeMatch) continue;

        const toolName = meta.name;
        if (toolRegistry.has(`custom_${toolName}`)) continue;

        this.registerCustomTool(toolName, meta.description, codeMatch[1], meta.parameters);
        loaded++;
      }

      return { success: true, output: `Loaded ${loaded} custom tool(s) from disk.` };
    } catch (err: any) {
      return { success: false, output: "", error: `Failed to load tools: ${err.message}` };
    }
  }
}

export const toolBuilderAgent = new ToolBuilderAgent();

export const createToolSchema = z.object({
  name: z.string().describe("Name for the new tool (alphanumeric, hyphens, underscores)"),
  description: z.string().describe("Description of what the tool does"),
  logic: z.string().describe("Either a template name (file-transformer, data-validator, api-caller) or JavaScript code containing 'async function handler(args)' that returns {success, output, error?}"),
  parameters: z.string().optional().describe("JSON string of parameter definitions: {paramName: {type, description, required}}"),
});

export const createToolDescription = "Create a new custom tool that persists and is available in future sessions. Use template names (file-transformer, data-validator, api-caller) or provide custom JS code.";

export async function createToolHandler(args: z.infer<typeof createToolSchema>): Promise<ToolResult> {
  let params: Record<string, { type: string; description?: string; required?: boolean }> | undefined;
  if (args.parameters) {
    try {
      params = JSON.parse(args.parameters);
    } catch {
      return { success: false, output: "", error: "Invalid JSON in parameters field" };
    }
  }
  return toolBuilderAgent.buildTool(args.name, args.description, args.logic, params);
}
