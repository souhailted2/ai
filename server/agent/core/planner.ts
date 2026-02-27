import { isCloudMode, generateResponseWithLLM } from "../../llm-router";
import { toolRegistry } from "../tools/registry";

export type PlanStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PlanStep {
  id: string;
  description: string;
  toolHints: string[];
  dependencies: string[];
  status: PlanStepStatus;
  checkpoint: boolean;
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
}

export class AgentPlanner {
  async generatePlan(goal: string, context?: string): Promise<Plan> {
    const planId = `plan_${Date.now()}`;

    if (isCloudMode()) {
      const llmPlan = await this.generateWithLLM(goal, context, planId);
      if (llmPlan) return llmPlan;
    }

    return this.generateOffline(goal, planId);
  }

  revisePlan(plan: Plan, obstacle: string, failedStepId: string): Plan {
    const updated = { ...plan, updatedAt: Date.now() };
    updated.steps = updated.steps.map(step => {
      if (step.id === failedStepId) {
        return { ...step, status: "failed" as PlanStepStatus, error: obstacle };
      }
      return step;
    });

    const failedIndex = updated.steps.findIndex(s => s.id === failedStepId);
    if (failedIndex >= 0 && failedIndex < updated.steps.length - 1) {
      const retryStep: PlanStep = {
        id: `step_retry_${Date.now()}`,
        description: `Retry: fix "${obstacle}" and continue`,
        toolHints: updated.steps[failedIndex].toolHints,
        dependencies: [],
        status: "pending",
        checkpoint: false,
      };

      updated.steps.splice(failedIndex + 1, 0, retryStep);
    }

    return updated;
  }

  markComplete(plan: Plan, stepId: string, output?: string): Plan {
    return {
      ...plan,
      updatedAt: Date.now(),
      steps: plan.steps.map(s =>
        s.id === stepId
          ? { ...s, status: "completed" as PlanStepStatus, output, completedAt: Date.now() }
          : s
      ),
    };
  }

  markRunning(plan: Plan, stepId: string): Plan {
    return {
      ...plan,
      updatedAt: Date.now(),
      steps: plan.steps.map(s =>
        s.id === stepId
          ? { ...s, status: "running" as PlanStepStatus, startedAt: Date.now() }
          : s
      ),
    };
  }

  markFailed(plan: Plan, stepId: string, error: string): Plan {
    return {
      ...plan,
      updatedAt: Date.now(),
      steps: plan.steps.map(s =>
        s.id === stepId
          ? { ...s, status: "failed" as PlanStepStatus, error, completedAt: Date.now() }
          : s
      ),
    };
  }

  getNextStep(plan: Plan): PlanStep | null {
    return plan.steps.find(s => s.status === "pending") || null;
  }

  isComplete(plan: Plan): boolean {
    return plan.steps.every(s => s.status === "completed" || s.status === "skipped");
  }

  hasFailed(plan: Plan): boolean {
    return plan.steps.some(s => s.status === "failed");
  }

  toCheckpoint(plan: Plan): any {
    return {
      id: plan.id,
      goal: plan.goal,
      steps: plan.steps,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  fromCheckpoint(data: any): Plan {
    return {
      id: data.id,
      goal: data.goal,
      steps: data.steps || [],
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    };
  }

  private async generateWithLLM(goal: string, context: string | undefined, planId: string): Promise<Plan | null> {
    const availableTools = toolRegistry.listTools();
    const toolList = availableTools.map(t => t.name).join(", ");

    const systemPrompt = `You are a task planner for an AI coding agent. Break down the user's goal into actionable steps.

Available tools: ${toolList}

Return ONLY valid JSON with this structure:
{
  "steps": [
    {
      "description": "What to do in this step",
      "toolHints": ["tool1", "tool2"],
      "checkpoint": true/false
    }
  ]
}

Rules:
- Each step should be atomic and achievable
- Use toolHints to suggest which tools to use
- Set checkpoint: true for critical milestones
- Keep steps concise (5-10 steps max)
- Order steps logically with dependencies`;

    const prompt = context ? `Goal: ${goal}\n\nContext:\n${context}` : `Goal: ${goal}`;
    const result = await generateResponseWithLLM(prompt, systemPrompt);
    if (!result) return null;

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.steps)) return null;

      const steps: PlanStep[] = parsed.steps.map((s: any, i: number) => ({
        id: `step_${i + 1}`,
        description: s.description || `Step ${i + 1}`,
        toolHints: Array.isArray(s.toolHints) ? s.toolHints : [],
        dependencies: i > 0 ? [`step_${i}`] : [],
        status: "pending" as PlanStepStatus,
        checkpoint: !!s.checkpoint,
      }));

      return {
        id: planId,
        goal,
        steps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  private generateOffline(goal: string, planId: string): Plan {
    const lower = goal.toLowerCase();
    const steps: PlanStep[] = [];

    if (this.matchesAny(lower, ["build", "create", "make", "ابني", "أنشئ", "اعمل", "ديرلي", "créer", "construire"])) {
      steps.push(
        this.step("step_1", "Analyze requirements and determine project type", ["codeExec"], [], true),
        this.step("step_2", "Generate project structure and files", ["writeFile"], ["step_1"], false),
        this.step("step_3", "Write main application code", ["writeFile"], ["step_2"], true),
        this.step("step_4", "Create configuration files (package.json, etc.)", ["writeFile"], ["step_2"], false),
        this.step("step_5", "Validate generated files", ["listFiles", "readFile"], ["step_3", "step_4"], true),
      );
    } else if (this.matchesAny(lower, ["fix", "debug", "error", "صلح", "خطأ", "bug", "corriger"])) {
      steps.push(
        this.step("step_1", "List project files and identify error location", ["listFiles", "readFile"], [], true),
        this.step("step_2", "Analyze error and determine fix", ["codeExec"], ["step_1"], false),
        this.step("step_3", "Apply fix to affected files", ["writeFile"], ["step_2"], true),
        this.step("step_4", "Verify fix by reviewing changes", ["readFile"], ["step_3"], true),
      );
    } else if (this.matchesAny(lower, ["search", "find", "research", "ابحث", "بحث", "chercher"])) {
      steps.push(
        this.step("step_1", "Search the web for relevant information", ["searchWeb"], [], true),
        this.step("step_2", "Fetch and analyze top results", ["fetchUrl"], ["step_1"], false),
        this.step("step_3", "Compile findings into a summary", ["codeExec"], ["step_2"], true),
        this.step("step_4", "Save results to file", ["writeFile"], ["step_3"], true),
      );
    } else if (this.matchesAny(lower, ["test", "run", "شغل", "نفذ", "tester", "exécuter"])) {
      steps.push(
        this.step("step_1", "List project files", ["listFiles"], [], false),
        this.step("step_2", "Run project command", ["shell"], ["step_1"], true),
        this.step("step_3", "Analyze output", ["codeExec"], ["step_2"], true),
      );
    } else if (this.matchesAny(lower, ["improve", "optimize", "حسن", "طور", "améliorer"])) {
      steps.push(
        this.step("step_1", "Review current codebase", ["listFiles", "readFile"], [], true),
        this.step("step_2", "Identify improvement areas", ["codeExec"], ["step_1"], false),
        this.step("step_3", "Apply optimizations", ["writeFile"], ["step_2"], true),
        this.step("step_4", "Validate improvements", ["readFile"], ["step_3"], true),
      );
    } else {
      steps.push(
        this.step("step_1", "Analyze the request", ["codeExec"], [], true),
        this.step("step_2", "Gather relevant information", ["listFiles", "searchWeb"], ["step_1"], false),
        this.step("step_3", "Execute the main task", ["writeFile", "codeExec"], ["step_2"], true),
        this.step("step_4", "Verify results", ["readFile"], ["step_3"], true),
      );
    }

    return {
      id: planId,
      goal,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private step(id: string, description: string, toolHints: string[], dependencies: string[], checkpoint: boolean): PlanStep {
    return { id, description, toolHints, dependencies, status: "pending", checkpoint };
  }

  private matchesAny(text: string, keywords: string[]): boolean {
    return keywords.some(k => text.includes(k));
  }
}

export const agentPlanner = new AgentPlanner();
