import { z } from "zod";
import type { ToolResult } from "../registry";
import { runCommand, exportProjectToDisk, type RunnerOutput } from "../../../runner";

const shellSchema = z.object({
  command: z.string().describe("The shell command to run (must be in the npm allowlist)"),
  projectId: z.string().describe("The project ID to run the command in"),
});

export const shellToolDescription = "Execute an allowed shell command (npm install, npm run dev, npm run build, npm test, npm run start, npm run lint) in a project workspace with enhanced output capture";

export async function shellHandler(args: z.infer<typeof shellSchema>): Promise<ToolResult> {
  try {
    const slug = await exportProjectToDisk(args.projectId);
    const outputs: RunnerOutput[] = [];

    const exitCode = await runCommand(slug, args.command, (output) => {
      outputs.push(output);
    });

    const stdout = outputs
      .filter((o) => o.type === "stdout")
      .map((o) => o.data)
      .join("");
    const stderr = outputs
      .filter((o) => o.type === "stderr")
      .map((o) => o.data)
      .join("");
    const combined = outputs.map((o) => o.data).join("");

    return {
      success: exitCode === 0,
      output: combined,
      error: exitCode !== 0 ? stderr || `Process exited with code ${exitCode}` : undefined,
    };
  } catch (err: any) {
    return { success: false, output: "", error: err.message };
  }
}

export { shellSchema };
