import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  handler: (args: any) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: string[];
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(name: string, handler: (args: any) => Promise<ToolResult>, schema: z.ZodType<any>, description: string = ""): void {
    this.tools.set(name, { name, description, parameters: schema, handler });
  }

  async execute(name: string, args: any): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: "", error: `Tool not found: ${name}` };
    }

    const parsed = tool.parameters.safeParse(args);
    if (!parsed.success) {
      return { success: false, output: "", error: `Invalid arguments: ${parsed.error.message}` };
    }

    try {
      return await tool.handler(parsed.data);
    } catch (err: any) {
      return { success: false, output: "", error: `Tool execution error: ${err.message}` };
    }
  }

  listTools(): ToolInfo[] {
    const result: ToolInfo[] = [];
    this.tools.forEach((tool) => {
      let parameters: Record<string, any> = {};
      if (tool.parameters instanceof z.ZodObject) {
        const shape = (tool.parameters as z.ZodObject<any>).shape;
        for (const [key, value] of Object.entries(shape)) {
          parameters[key] = {
            type: getZodTypeName(value as z.ZodType<any>),
            optional: (value as any).isOptional?.() ?? false,
          };
        }
      }
      result.push({ name: tool.name, description: tool.description, parameters });
    });
    return result;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}

function getZodTypeName(schema: z.ZodType<any>): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodArray) return "array";
  if (schema instanceof z.ZodObject) return "object";
  if (schema instanceof z.ZodOptional) return getZodTypeName((schema as any)._def.innerType);
  if (schema instanceof z.ZodDefault) return getZodTypeName((schema as any)._def.innerType);
  return "unknown";
}

export const toolRegistry = new ToolRegistry();
