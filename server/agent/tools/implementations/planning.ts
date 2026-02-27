import { z } from "zod";
import type { ToolResult } from "../registry";

export interface PlanStep {
  id: number;
  title: string;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  notes?: string;
}

export interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
}

const plans: Map<string, Plan> = new Map();
let activePlanId: string | null = null;

export const planningSchema = z.object({
  command: z.enum(["create", "update", "get", "list", "mark_step", "delete", "set_active"]).describe("Planning command to execute"),
  planId: z.string().optional().describe("Plan ID (required for most commands)"),
  title: z.string().optional().describe("Plan title (for create/update)"),
  steps: z.array(z.string()).optional().describe("Array of step titles (for create/update)"),
  stepIndex: z.number().optional().describe("Step index (for mark_step)"),
  stepStatus: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional().describe("Step status (for mark_step)"),
  notes: z.string().optional().describe("Notes for the step (for mark_step)"),
});

export const planningDescription = "Manage execution plans with create, update, get, list, mark_step, delete, set_active commands. Status markers: [✓] completed, [→] in progress, [!] blocked, [ ] not started";

function formatPlan(plan: Plan): string {
  const statusIcon = (s: PlanStep["status"]) => {
    switch (s) {
      case "completed": return "[✓]";
      case "in_progress": return "[→]";
      case "blocked": return "[!]";
      default: return "[ ]";
    }
  };

  const lines: string[] = [];
  lines.push(`Plan: ${plan.title} (${plan.id})`);
  lines.push(`Active: ${activePlanId === plan.id ? "YES" : "no"}`);
  lines.push(`Steps:`);
  for (const step of plan.steps) {
    const note = step.notes ? ` — ${step.notes}` : "";
    lines.push(`  ${step.id}. ${statusIcon(step.status)} ${step.title}${note}`);
  }
  return lines.join("\n");
}

export async function planningHandler(args: z.infer<typeof planningSchema>): Promise<ToolResult> {
  const { command } = args;

  switch (command) {
    case "create": {
      if (!args.title || !args.steps || args.steps.length === 0) {
        return { success: false, output: "", error: "create requires title and steps (non-empty array)" };
      }
      const id = args.planId || `plan_${Date.now()}`;
      const plan: Plan = {
        id,
        title: args.title,
        steps: args.steps.map((title, i) => ({
          id: i,
          title,
          status: "not_started",
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      plans.set(id, plan);
      if (!activePlanId) {
        activePlanId = id;
      }
      return { success: true, output: `Plan created:\n${formatPlan(plan)}` };
    }

    case "update": {
      const planId = args.planId;
      if (!planId) {
        return { success: false, output: "", error: "update requires planId" };
      }
      const plan = plans.get(planId);
      if (!plan) {
        return { success: false, output: "", error: `Plan not found: ${planId}` };
      }
      if (args.title) {
        plan.title = args.title;
      }
      if (args.steps && args.steps.length > 0) {
        plan.steps = args.steps.map((title, i) => ({
          id: i,
          title,
          status: "not_started",
        }));
      }
      plan.updatedAt = Date.now();
      return { success: true, output: `Plan updated:\n${formatPlan(plan)}` };
    }

    case "get": {
      const planId = args.planId || activePlanId;
      if (!planId) {
        return { success: false, output: "", error: "No plan ID provided and no active plan" };
      }
      const plan = plans.get(planId);
      if (!plan) {
        return { success: false, output: "", error: `Plan not found: ${planId}` };
      }
      return { success: true, output: formatPlan(plan) };
    }

    case "list": {
      if (plans.size === 0) {
        return { success: true, output: "No plans exist." };
      }
      const lines: string[] = [];
      const allPlans = Array.from(plans.entries());
      for (const [id, plan] of allPlans) {
        const completed = plan.steps.filter((s: PlanStep) => s.status === "completed").length;
        const total = plan.steps.length;
        const active = activePlanId === id ? " [ACTIVE]" : "";
        lines.push(`${id}: ${plan.title} (${completed}/${total} steps done)${active}`);
      }
      return { success: true, output: lines.join("\n") };
    }

    case "mark_step": {
      const planId = args.planId || activePlanId;
      if (!planId) {
        return { success: false, output: "", error: "No plan ID provided and no active plan" };
      }
      const plan = plans.get(planId);
      if (!plan) {
        return { success: false, output: "", error: `Plan not found: ${planId}` };
      }
      if (args.stepIndex === undefined || args.stepIndex < 0 || args.stepIndex >= plan.steps.length) {
        return { success: false, output: "", error: `Invalid step index: ${args.stepIndex}. Plan has ${plan.steps.length} steps (0-${plan.steps.length - 1}).` };
      }
      if (!args.stepStatus) {
        return { success: false, output: "", error: "mark_step requires stepStatus" };
      }
      plan.steps[args.stepIndex].status = args.stepStatus;
      if (args.notes) {
        plan.steps[args.stepIndex].notes = args.notes;
      }
      plan.updatedAt = Date.now();
      return { success: true, output: `Step ${args.stepIndex} marked as ${args.stepStatus}:\n${formatPlan(plan)}` };
    }

    case "delete": {
      const planId = args.planId;
      if (!planId) {
        return { success: false, output: "", error: "delete requires planId" };
      }
      if (!plans.has(planId)) {
        return { success: false, output: "", error: `Plan not found: ${planId}` };
      }
      plans.delete(planId);
      if (activePlanId === planId) {
        activePlanId = null;
      }
      return { success: true, output: `Plan deleted: ${planId}` };
    }

    case "set_active": {
      const planId = args.planId;
      if (!planId) {
        return { success: false, output: "", error: "set_active requires planId" };
      }
      if (!plans.has(planId)) {
        return { success: false, output: "", error: `Plan not found: ${planId}` };
      }
      activePlanId = planId;
      return { success: true, output: `Active plan set to: ${planId}` };
    }

    default:
      return { success: false, output: "", error: `Unknown command: ${command}` };
  }
}

export function getPlansSnapshot(): { plans: Plan[]; activePlanId: string | null } {
  return {
    plans: Array.from(plans.values()),
    activePlanId,
  };
}
