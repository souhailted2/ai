import { agentPlanner, type Plan, type PlanStep } from "./planner";
import { codeActEngine, type CodeActResult } from "./codeact";
import { enhancedMemory } from "../memory/enhanced-memory";
import { createScratchpad } from "../memory/scratchpad";
import { toolRegistry } from "../tools/registry";
import { exportProjectToDisk } from "../../runner";

export type AgentLoopState =
  | "idle"
  | "analyzing"
  | "planning"
  | "proposing"
  | "waiting_approval"
  | "approved"
  | "executing"
  | "observing"
  | "correcting"
  | "waiting_for_human"
  | "complete"
  | "error";

export interface AgentEvent {
  type:
    | "thought"
    | "plan"
    | "code"
    | "executing"
    | "observation"
    | "error"
    | "correction"
    | "complete"
    | "state-change"
    | "proposal"
    | "approval-required"
    | "approved"
    | "rejected"
    | "ask-human"
    | "human-response"
    | "think"
    | "act"
    | "stuck-detected";
  timestamp: number;
  payload: any;
  agentId?: string;
  iteration?: number;
}

export interface AgentLoopConfig {
  maxIterations: number;
  timeoutMinutes: number;
  maxRetries: number;
  requireApproval: boolean;
  stuckThreshold: number;
  askHumanTimeoutMs: number;
}

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxIterations: 20,
  timeoutMinutes: 10,
  maxRetries: 3,
  requireApproval: true,
  stuckThreshold: 3,
  askHumanTimeoutMs: 5 * 60 * 1000,
};

export interface StepMetrics {
  stepId: string;
  description: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  status: "completed" | "failed";
  toolsCalled: string[];
}

export interface AgentLoopResult {
  success: boolean;
  plan: Plan | null;
  iterations: number;
  events: AgentEvent[];
  output: string;
  error?: string;
  metrics?: StepMetrics[];
  totalDurationMs?: number;
}

interface ThinkResult {
  action: string;
  reasoning: string;
  toolHints: string[];
  shouldAskHuman: boolean;
  question?: string;
}

export class AgentLoop {
  private state: AgentLoopState = "idle";
  private plan: Plan | null = null;
  private events: AgentEvent[] = [];
  private iteration: number = 0;
  private config: AgentLoopConfig;
  private projectId: string = "";
  private projectSlug: string = "";
  private onEvent: ((event: AgentEvent) => void) | null = null;
  private aborted: boolean = false;

  private approvalResolver: ((approved: boolean) => void) | null = null;
  private approvalPromise: Promise<boolean> | null = null;
  private rejectionFeedback: string | null = null;

  private humanResponseResolver: ((response: string) => void) | null = null;
  private humanResponsePromise: Promise<string> | null = null;

  private recentActions: string[] = [];
  private stepMetrics: StepMetrics[] = [];

  constructor(config?: Partial<AgentLoopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): AgentLoopState {
    return this.state;
  }

  getPlan(): Plan | null {
    return this.plan;
  }

  getIteration(): number {
    return this.iteration;
  }

  getMaxIterations(): number {
    return this.config.maxIterations;
  }

  abort(): void {
    this.aborted = true;
    if (this.approvalResolver) {
      this.approvalResolver(false);
    }
    if (this.humanResponseResolver) {
      this.humanResponseResolver("__aborted__");
    }
  }

  approve(): void {
    if (this.approvalResolver) {
      this.approvalResolver(true);
      this.approvalResolver = null;
    }
  }

  reject(feedback?: string): void {
    this.rejectionFeedback = feedback || null;
    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  respondToHuman(response: string): void {
    if (this.humanResponseResolver) {
      this.humanResponseResolver(response);
      this.humanResponseResolver = null;
    }
  }

  isWaitingForApproval(): boolean {
    return this.state === "waiting_approval";
  }

  isWaitingForHuman(): boolean {
    return this.state === "waiting_for_human";
  }

  private async waitForApproval(): Promise<boolean> {
    this.approvalPromise = new Promise<boolean>((resolve) => {
      this.approvalResolver = resolve;
    });
    return this.approvalPromise;
  }

  private async waitForHumanResponse(question: string): Promise<string> {
    this.setState("waiting_for_human");
    this.emit({
      type: "ask-human",
      timestamp: Date.now(),
      payload: { question, timeoutMs: this.config.askHumanTimeoutMs },
    });

    this.humanResponsePromise = new Promise<string>((resolve) => {
      this.humanResponseResolver = resolve;

      setTimeout(() => {
        if (this.humanResponseResolver) {
          this.humanResponseResolver("__timeout__");
          this.humanResponseResolver = null;
        }
      }, this.config.askHumanTimeoutMs);
    });

    const response = await this.humanResponsePromise;
    this.humanResponsePromise = null;

    if (response === "__timeout__") {
      this.emit({
        type: "human-response",
        timestamp: Date.now(),
        payload: { response: null, timedOut: true, message: "No response received, proceeding with best judgment" },
      });
      return "";
    }

    if (response === "__aborted__") {
      return "";
    }

    this.emit({
      type: "human-response",
      timestamp: Date.now(),
      payload: { response, timedOut: false },
    });

    return response;
  }

  private think(step: PlanStep, context: string): ThinkResult {
    const lower = step.description.toLowerCase();

    let shouldAskHuman = false;
    let question: string | undefined;

    if (lower.includes("clarify") || lower.includes("ambiguous") || lower.includes("unclear")) {
      shouldAskHuman = true;
      question = `The task "${step.description}" needs clarification. Can you provide more details?`;
    }

    const reasoning = `Analyzing step: "${step.description}". Tool hints: [${step.toolHints.join(", ")}]. ` +
      `Context available: ${context ? "yes" : "no"}. ` +
      `Approach: execute using ${step.toolHints.length > 0 ? step.toolHints[0] : "codeExec"}.`;

    this.emit({
      type: "think",
      timestamp: Date.now(),
      payload: {
        stepId: step.id,
        reasoning,
        action: step.description,
        shouldAskHuman,
      },
      iteration: this.iteration,
    });

    return {
      action: step.description,
      reasoning,
      toolHints: step.toolHints,
      shouldAskHuman,
      question,
    };
  }

  private detectStuck(action: string): boolean {
    this.recentActions.push(action);
    if (this.recentActions.length > this.config.stuckThreshold * 2) {
      this.recentActions = this.recentActions.slice(-this.config.stuckThreshold * 2);
    }

    if (this.recentActions.length >= this.config.stuckThreshold) {
      const lastN = this.recentActions.slice(-this.config.stuckThreshold);
      const allSame = lastN.every((a) => a === lastN[0]);
      if (allSame) {
        this.emit({
          type: "stuck-detected",
          timestamp: Date.now(),
          payload: {
            repeatedAction: lastN[0],
            count: this.config.stuckThreshold,
            message: `Detected ${this.config.stuckThreshold} repeated identical actions. Forcing replan.`,
          },
          iteration: this.iteration,
        });
        return true;
      }
    }
    return false;
  }

  async run(
    task: string,
    projectId: string,
    onEvent?: (event: AgentEvent) => void
  ): Promise<AgentLoopResult> {
    this.projectId = projectId;
    this.onEvent = onEvent || null;
    this.events = [];
    this.iteration = 0;
    this.aborted = false;
    this.plan = null;
    this.recentActions = [];
    this.rejectionFeedback = null;
    this.stepMetrics = [];

    const startTime = Date.now();
    const timeoutMs = this.config.timeoutMinutes * 60 * 1000;

    try {
      this.projectSlug = await exportProjectToDisk(projectId);
    } catch {
      this.projectSlug = projectId.slice(0, 8);
    }

    const scratchpad = createScratchpad(projectId);

    try {
      this.setState("analyzing");
      this.emit({ type: "thought", timestamp: Date.now(), payload: { message: `Analyzing task: "${task}"` } });

      const memories = await enhancedMemory.retrieve(task);
      const memoryContext = memories.length > 0
        ? memories.slice(0, 5).map(m => `[${m.layer}] ${m.key}: ${m.value.substring(0, 200)}`).join("\n")
        : "";

      const context = memoryContext ? `Previous context:\n${memoryContext}` : "";

      this.setState("planning");
      this.plan = await agentPlanner.generatePlan(task, context);
      scratchpad.writeTodo(this.plan.steps.map(s => s.description));

      this.emit({
        type: "plan",
        timestamp: Date.now(),
        payload: {
          planId: this.plan.id,
          goal: this.plan.goal,
          steps: this.plan.steps.map(s => ({ id: s.id, description: s.description, status: s.status, toolHints: s.toolHints })),
        },
      });

      if (this.config.requireApproval) {
        this.setState("proposing");
        this.emit({
          type: "proposal",
          timestamp: Date.now(),
          payload: {
            planId: this.plan.id,
            goal: this.plan.goal,
            steps: this.plan.steps.map(s => ({
              id: s.id,
              description: s.description,
              toolHints: s.toolHints,
            })),
            message: "Plan ready for review. Approve to proceed or reject to replan.",
          },
        });

        this.setState("waiting_approval");
        this.emit({
          type: "approval-required",
          timestamp: Date.now(),
          payload: {
            planId: this.plan.id,
            message: "Waiting for user approval before executing the plan.",
          },
        });

        const approved = await this.waitForApproval();

        if (this.aborted) {
          this.setState("error");
          return {
            success: false,
            plan: this.plan,
            iterations: this.iteration,
            events: this.events,
            output: "",
            error: "Aborted while waiting for approval",
          };
        }

        if (!approved) {
          this.emit({
            type: "rejected",
            timestamp: Date.now(),
            payload: {
              feedback: this.rejectionFeedback,
              message: "Plan rejected by user. Replanning...",
            },
          });

          const revisedTask = this.rejectionFeedback
            ? `${task} (User feedback: ${this.rejectionFeedback})`
            : task;

          this.setState("planning");
          this.plan = await agentPlanner.generatePlan(revisedTask, context);
          scratchpad.writeTodo(this.plan.steps.map(s => s.description));

          this.emit({
            type: "plan",
            timestamp: Date.now(),
            payload: {
              planId: this.plan.id,
              goal: this.plan.goal,
              steps: this.plan.steps.map(s => ({ id: s.id, description: s.description, status: s.status, toolHints: s.toolHints })),
              replanned: true,
            },
          });
        } else {
          this.setState("approved");
          this.emit({
            type: "approved",
            timestamp: Date.now(),
            payload: { planId: this.plan.id, message: "Plan approved. Executing..." },
          });
        }
      }

      while (!this.aborted && this.iteration < this.config.maxIterations && !agentPlanner.isComplete(this.plan)) {
        if (Date.now() - startTime > timeoutMs) {
          this.emit({ type: "error", timestamp: Date.now(), payload: { message: `Timeout after ${this.config.timeoutMinutes} minutes` } });
          break;
        }

        this.iteration++;
        const currentStep = agentPlanner.getNextStep(this.plan);
        if (!currentStep) break;

        const thinkResult = this.think(currentStep, context);

        if (thinkResult.shouldAskHuman && thinkResult.question) {
          const humanResponse = await this.waitForHumanResponse(thinkResult.question);
          if (this.aborted) break;

          if (humanResponse) {
            enhancedMemory.addWorkingMemory(
              `human_response:${currentStep.id}`,
              humanResponse
            );
          }
        }

        const isStuck = this.detectStuck(currentStep.description);
        if (isStuck) {
          this.setState("correcting");
          this.plan = agentPlanner.revisePlan(
            this.plan,
            "Stuck: repeated identical actions detected. Trying alternative approach.",
            currentStep.id
          );
          continue;
        }

        this.emit({
          type: "act",
          timestamp: Date.now(),
          payload: {
            stepId: currentStep.id,
            action: thinkResult.action,
            reasoning: thinkResult.reasoning,
          },
          iteration: this.iteration,
        });

        const success = await this.executeStep(currentStep, context, scratchpad);

        if (!success && currentStep.status === "failed") {
          const retryCount = this.plan.steps.filter(s => s.id.startsWith("step_retry")).length;
          if (retryCount < this.config.maxRetries) {
            this.setState("correcting");
            this.emit({
              type: "correction",
              timestamp: Date.now(),
              payload: { message: `Retrying after error: ${currentStep.error}`, retryCount: retryCount + 1 },
              iteration: this.iteration,
            });
            this.plan = agentPlanner.revisePlan(this.plan, currentStep.error || "Unknown error", currentStep.id);
          } else {
            this.emit({
              type: "error",
              timestamp: Date.now(),
              payload: { message: `Max retries (${this.config.maxRetries}) exceeded for step: ${currentStep.description}` },
              iteration: this.iteration,
            });
            break;
          }
        }

        if (currentStep.checkpoint && currentStep.status === "completed") {
          scratchpad.saveCheckpoint(agentPlanner.toCheckpoint(this.plan));
        }
      }

      const isComplete = this.plan && agentPlanner.isComplete(this.plan);
      this.setState(isComplete ? "complete" : "error");

      const completedSteps = this.plan?.steps.filter(s => s.status === "completed") || [];
      const output = completedSteps.map(s => `[${s.id}] ${s.description}: ${s.output || "done"}`).join("\n");

      enhancedMemory.addEpisode(
        `run_${Date.now()}`,
        `Task: ${task} | Steps: ${completedSteps.length}/${this.plan?.steps.length || 0} | Success: ${isComplete}`,
        projectId
      );

      const totalDurationMs = Date.now() - startTime;

      const result: AgentLoopResult = {
        success: !!isComplete,
        plan: this.plan,
        iterations: this.iteration,
        events: this.events,
        output: output || "No output produced",
        error: isComplete ? undefined : "Task did not complete fully",
        metrics: this.stepMetrics,
        totalDurationMs,
      };

      this.emit({
        type: "complete",
        timestamp: Date.now(),
        payload: {
          success: result.success,
          iterations: result.iterations,
          stepsCompleted: completedSteps.length,
          totalSteps: this.plan?.steps.length || 0,
        },
      });

      return result;
    } catch (err: any) {
      this.setState("error");
      this.emit({ type: "error", timestamp: Date.now(), payload: { message: err.message } });
      return {
        success: false,
        plan: this.plan,
        iterations: this.iteration,
        events: this.events,
        output: "",
        error: err.message,
      };
    }
  }

  private async executeStep(step: PlanStep, context: string, scratchpad: any): Promise<boolean> {
    const stepStartTime = Date.now();
    this.setState("executing");
    this.plan = agentPlanner.markRunning(this.plan!, step.id);

    this.emit({
      type: "executing",
      timestamp: Date.now(),
      payload: { stepId: step.id, description: step.description, toolHints: step.toolHints },
      iteration: this.iteration,
    });

    const availableTools = toolRegistry.listTools();
    const taskForCode = `${step.description} (part of: ${this.plan!.goal})`;

    let code: string;
    try {
      code = await codeActEngine.generateCode(taskForCode, context, availableTools);
      code = code.replace(/__SLUG__/g, this.projectSlug);
    } catch (err: any) {
      this.plan = agentPlanner.markFailed(this.plan!, step.id, `Code generation failed: ${err.message}`);
      this.recordStepMetrics(step, stepStartTime, "failed", []);
      return false;
    }

    this.emit({
      type: "code",
      timestamp: Date.now(),
      payload: { stepId: step.id, code },
      iteration: this.iteration,
    });

    let result: CodeActResult;
    try {
      result = await codeActEngine.executeCode(code, this.projectSlug, 15000);
    } catch (err: any) {
      this.plan = agentPlanner.markFailed(this.plan!, step.id, `Execution failed: ${err.message}`);
      this.recordStepMetrics(step, stepStartTime, "failed", []);
      return false;
    }

    if (result.toolsCalled.includes("askHuman")) {
      const askMatch = result.output.match(/\[ASK_HUMAN\]([\s\S]*?)\[\/ASK_HUMAN\]/);
      if (askMatch) {
        const question = askMatch[1].trim();
        const humanResponse = await this.waitForHumanResponse(question);
        if (humanResponse) {
          enhancedMemory.addWorkingMemory(
            `human_response:${step.id}`,
            humanResponse
          );
        }
      }
    }

    this.setState("observing");
    this.emit({
      type: "observation",
      timestamp: Date.now(),
      payload: {
        stepId: step.id,
        output: result.output,
        error: result.error,
        toolsCalled: result.toolsCalled,
        artifacts: result.artifacts,
      },
      iteration: this.iteration,
    });

    if (result.error && !result.output) {
      this.plan = agentPlanner.markFailed(this.plan!, step.id, result.error);
      this.recordStepMetrics(step, stepStartTime, "failed", result.toolsCalled);
      return false;
    }

    this.plan = agentPlanner.markComplete(this.plan!, step.id, result.output);
    this.recordStepMetrics(step, stepStartTime, "completed", result.toolsCalled);

    enhancedMemory.addWorkingMemory(
      `step:${step.id}`,
      `${step.description}: ${(result.output || "").substring(0, 300)}`
    );

    return true;
  }

  private recordStepMetrics(step: PlanStep, startedAt: number, status: "completed" | "failed", toolsCalled: string[]): void {
    const completedAt = Date.now();
    const metric: StepMetrics = {
      stepId: step.id,
      description: step.description,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      status,
      toolsCalled,
    };
    this.stepMetrics.push(metric);
    this.emit({
      type: "observation",
      timestamp: completedAt,
      payload: {
        type: "step-metrics",
        ...metric,
      },
      iteration: this.iteration,
    });
  }

  getMetrics(): StepMetrics[] {
    return this.stepMetrics;
  }

  private setState(state: AgentLoopState): void {
    this.state = state;
    this.emit({
      type: "state-change",
      timestamp: Date.now(),
      payload: { state, iteration: this.iteration },
    });
  }

  private emit(event: AgentEvent): void {
    if (!event.iteration) event.iteration = this.iteration;
    this.events.push(event);
    if (this.onEvent) {
      try {
        this.onEvent(event);
      } catch {}
    }
  }
}

const activeLoops = new Map<string, AgentLoop>();

export function getActiveLoop(projectId: string): AgentLoop | null {
  return activeLoops.get(projectId) || null;
}

export function createAgentLoop(projectId: string, config?: Partial<AgentLoopConfig>): AgentLoop {
  const existing = activeLoops.get(projectId);
  if (existing && existing.getState() !== "idle" && existing.getState() !== "complete" && existing.getState() !== "error") {
    existing.abort();
  }
  const loop = new AgentLoop(config);
  activeLoops.set(projectId, loop);
  return loop;
}

export function removeAgentLoop(projectId: string): void {
  const loop = activeLoops.get(projectId);
  if (loop) {
    loop.abort();
    activeLoops.delete(projectId);
  }
}
