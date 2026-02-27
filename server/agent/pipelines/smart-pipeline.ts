import { supervisorAgent, type SupervisorTask, type DecompositionResult } from "../agents/supervisor";
import { memoryAgent } from "../agents/memory-agent";
import { enhancedMemory } from "../memory/enhanced-memory";
import { createScratchpad } from "../memory/scratchpad";
import { createAgentLoop, getActiveLoop, type AgentEvent } from "../core/loop";

export type SmartPipelinePhase =
  | "idea"
  | "decomposition"
  | "planning"
  | "approval"
  | "execution"
  | "improvement"
  | "complete"
  | "error";

export interface TaskMetrics {
  taskId: string;
  agent: string;
  description: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  status: "completed" | "failed";
  parallel: boolean;
}

export interface SmartPipelineStatus {
  phase: SmartPipelinePhase;
  decomposition: DecompositionResult | null;
  currentTaskIndex: number;
  totalTasks: number;
  completedTasks: number;
  suggestion: string | null;
  events: SmartPipelineEvent[];
  startedAt: number;
  completedAt: number | null;
  taskMetrics: TaskMetrics[];
  parallelBatches: number;
}

export interface SmartPipelineEvent {
  type: "phase-change" | "task-start" | "task-complete" | "task-fail" | "suggestion" | "info";
  timestamp: number;
  payload: any;
}

export interface SmartPipelineConfig {
  requireApproval: boolean;
  maxTaskRetries: number;
  enableMemorySuggestions: boolean;
  maxParallelAgents: number;
}

const DEFAULT_PIPELINE_CONFIG: SmartPipelineConfig = {
  requireApproval: true,
  maxTaskRetries: 2,
  enableMemorySuggestions: true,
  maxParallelAgents: 2,
};

export class SmartPipeline {
  private phase: SmartPipelinePhase = "idea";
  private decomposition: DecompositionResult | null = null;
  private currentTaskIndex: number = 0;
  private completedTasks: number = 0;
  private suggestion: string | null = null;
  private events: SmartPipelineEvent[] = [];
  private startedAt: number = 0;
  private completedAt: number | null = null;
  private config: SmartPipelineConfig;
  private onEvent: ((event: SmartPipelineEvent) => void) | null = null;
  private taskMetrics: TaskMetrics[] = [];
  private parallelBatches: number = 0;

  constructor(config?: Partial<SmartPipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  getStatus(): SmartPipelineStatus {
    return {
      phase: this.phase,
      decomposition: this.decomposition,
      currentTaskIndex: this.currentTaskIndex,
      totalTasks: this.decomposition?.tasks.length || 0,
      completedTasks: this.completedTasks,
      suggestion: this.suggestion,
      events: this.events,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      taskMetrics: this.taskMetrics,
      parallelBatches: this.parallelBatches,
    };
  }

  async run(
    idea: string,
    projectId: string,
    onEvent?: (event: SmartPipelineEvent) => void,
    onAgentUpdate?: (agent: string, status: string, message: string) => void
  ): Promise<SmartPipelineStatus> {
    this.onEvent = onEvent || null;
    this.startedAt = Date.now();
    this.events = [];
    this.completedTasks = 0;
    this.currentTaskIndex = 0;
    this.suggestion = null;
    this.completedAt = null;
    this.taskMetrics = [];
    this.parallelBatches = 0;

    try {
      this.setPhase("idea");
      this.emit({ type: "info", timestamp: Date.now(), payload: { message: `Smart Pipeline started for: "${idea}"` } });

      if (onAgentUpdate) {
        onAgentUpdate("supervisor", "running", "Decomposing goal into tasks...");
      }

      this.setPhase("decomposition");
      this.decomposition = await supervisorAgent.decompose(idea);
      this.emit({
        type: "info",
        timestamp: Date.now(),
        payload: {
          message: `Decomposed into ${this.decomposition.tasks.length} tasks`,
          strategy: this.decomposition.strategy,
          complexity: this.decomposition.estimatedComplexity,
          tasks: this.decomposition.tasks.map(t => ({ id: t.id, description: t.description, agent: t.assignedAgent })),
        },
      });

      if (onAgentUpdate) {
        onAgentUpdate("supervisor", "completed", `Strategy: ${this.decomposition.strategy}`);
      }

      let memorySuggestion: string | null = null;
      if (this.config.enableMemorySuggestions) {
        try {
          const suggestion = await memoryAgent.suggestFromHistory(idea);
          if (suggestion.confidence > 0.4 && suggestion.basedOn.length > 0) {
            memorySuggestion = `Based on history: ${suggestion.approach} (confidence: ${Math.round(suggestion.confidence * 100)}%)`;
            this.suggestion = memorySuggestion;
            this.emit({
              type: "suggestion",
              timestamp: Date.now(),
              payload: {
                approach: suggestion.approach,
                confidence: suggestion.confidence,
                recommendedStack: suggestion.recommendedStack,
                basedOn: suggestion.basedOn,
              },
            });
          }
        } catch {}
      }

      this.setPhase("planning");
      const scratchpad = createScratchpad(projectId);
      scratchpad.writeTodo(this.decomposition.tasks.map(t => `[${t.assignedAgent}] ${t.description}`));

      this.emit({
        type: "info",
        timestamp: Date.now(),
        payload: { message: "Plan created and saved to scratchpad" },
      });

      this.setPhase("execution");

      const allTasks = this.decomposition.tasks;
      const processed = new Set<string>();

      while (processed.size < allTasks.length) {
        const completedIds = new Set(
          allTasks.filter(t => t.status === "completed").map(t => t.id)
        );

        const readyBatch = allTasks.filter(t => {
          if (processed.has(t.id)) return false;
          if (t.status === "completed" || t.status === "failed") return false;
          return t.dependencies.every(dep => completedIds.has(dep));
        });

        if (readyBatch.length === 0) {
          const remaining = allTasks.filter(t => !processed.has(t.id));
          for (const t of remaining) {
            t.status = "blocked";
            processed.add(t.id);
            this.emit({
              type: "task-fail",
              timestamp: Date.now(),
              payload: { taskId: t.id, reason: "Dependencies not met or circular dependency", blocked: true },
            });
          }
          break;
        }

        const batch = readyBatch.slice(0, this.config.maxParallelAgents);
        const isParallel = batch.length > 1;
        this.parallelBatches++;

        if (isParallel) {
          this.emit({
            type: "info",
            timestamp: Date.now(),
            payload: {
              message: `Running ${batch.length} tasks in parallel (batch #${this.parallelBatches})`,
              taskIds: batch.map(t => t.id),
              agents: batch.map(t => t.assignedAgent),
            },
          });
        }

        const batchPromises = batch.map(task => this.executeTaskWithRetries(task, projectId, idea, onAgentUpdate, isParallel));
        await Promise.allSettled(batchPromises);

        for (const task of batch) {
          processed.add(task.id);
        }
      }

      if (this.config.enableMemorySuggestions) {
        this.setPhase("improvement");
        try {
          const suggestions = await supervisorAgent.suggestEvolution();
          if (suggestions.length > 0) {
            this.suggestion = suggestions.join("; ");
            this.emit({
              type: "suggestion",
              timestamp: Date.now(),
              payload: { improvements: suggestions },
            });
          }
        } catch {}

        try {
          await memoryAgent.summarizeSession(
            projectId,
            this.decomposition.tasks.map(t => `[${t.assignedAgent}] ${t.description}: ${t.status}`),
            `Pipeline ${this.completedTasks === this.decomposition.tasks.length ? "completed" : "partial"}`
          );
        } catch {}
      }

      const allComplete = this.decomposition.tasks.every(t => t.status === "completed");
      this.setPhase(allComplete ? "complete" : "error");
      this.completedAt = Date.now();

      this.emit({
        type: "info",
        timestamp: Date.now(),
        payload: {
          message: allComplete ? "Smart Pipeline completed successfully" : "Smart Pipeline completed with some failures",
          completed: this.completedTasks,
          total: this.decomposition.tasks.length,
          duration: this.completedAt - this.startedAt,
        },
      });

      return this.getStatus();
    } catch (err: any) {
      this.setPhase("error");
      this.completedAt = Date.now();
      this.emit({
        type: "info",
        timestamp: Date.now(),
        payload: { message: `Pipeline error: ${err.message}` },
      });
      return this.getStatus();
    }
  }

  private async executeTaskWithRetries(
    task: SupervisorTask,
    projectId: string,
    overallGoal: string,
    onAgentUpdate?: (agent: string, status: string, message: string) => void,
    isParallel: boolean = false
  ): Promise<void> {
    const taskStartTime = Date.now();
    task.status = "in_progress";
    task.startedAt = Date.now();

    if (onAgentUpdate) {
      onAgentUpdate(task.assignedAgent, "running", task.description);
    }

    this.emit({
      type: "task-start",
      timestamp: Date.now(),
      payload: { taskId: task.id, agent: task.assignedAgent, description: task.description, parallel: isParallel },
    });

    let success = false;
    let retries = 0;

    while (!success && retries <= this.config.maxTaskRetries) {
      try {
        await this.executeTask(task, projectId, overallGoal);
        task.status = "completed";
        task.completedAt = Date.now();
        this.completedTasks++;
        success = true;

        const completedAt = Date.now();
        this.taskMetrics.push({
          taskId: task.id,
          agent: task.assignedAgent,
          description: task.description,
          startedAt: taskStartTime,
          completedAt,
          durationMs: completedAt - taskStartTime,
          status: "completed",
          parallel: isParallel,
        });

        if (onAgentUpdate) {
          onAgentUpdate(task.assignedAgent, "completed", task.description);
        }

        this.emit({
          type: "task-complete",
          timestamp: Date.now(),
          payload: { taskId: task.id, agent: task.assignedAgent, durationMs: completedAt - taskStartTime },
        });
      } catch (err: any) {
        retries++;
        if (retries > this.config.maxTaskRetries) {
          task.status = "failed";
          task.error = err.message;

          const completedAt = Date.now();
          this.taskMetrics.push({
            taskId: task.id,
            agent: task.assignedAgent,
            description: task.description,
            startedAt: taskStartTime,
            completedAt,
            durationMs: completedAt - taskStartTime,
            status: "failed",
            parallel: isParallel,
          });

          if (onAgentUpdate) {
            onAgentUpdate(task.assignedAgent, "error", `Failed: ${err.message}`);
          }

          this.emit({
            type: "task-fail",
            timestamp: Date.now(),
            payload: { taskId: task.id, error: err.message, retries },
          });
        }
      }
    }
  }

  private async executeTask(task: SupervisorTask, projectId: string, overallGoal: string): Promise<void> {
    const agentLoop = createAgentLoop(projectId, {
      maxIterations: 5,
      timeoutMinutes: 3,
      requireApproval: false,
      stuckThreshold: 3,
      maxRetries: 1,
      askHumanTimeoutMs: 60000,
    });

    const taskDescription = `${task.description} (Part of: ${overallGoal})`;

    const result = await agentLoop.run(taskDescription, projectId, (event: AgentEvent) => {
      if (event.type === "error") {
        this.emit({
          type: "info",
          timestamp: Date.now(),
          payload: { taskId: task.id, agentEvent: event.type, detail: event.payload },
        });
      }
    });

    if (!result.success) {
      throw new Error(result.error || "Task execution failed");
    }

    task.output = result.output;
  }

  private setPhase(phase: SmartPipelinePhase): void {
    this.phase = phase;
    this.emit({
      type: "phase-change",
      timestamp: Date.now(),
      payload: { phase },
    });
  }

  private emit(event: SmartPipelineEvent): void {
    this.events.push(event);
    if (this.onEvent) {
      try {
        this.onEvent(event);
      } catch {}
    }
  }
}

const activePipelines = new Map<string, SmartPipeline>();

export function createSmartPipeline(projectId: string, config?: Partial<SmartPipelineConfig>): SmartPipeline {
  const existing = activePipelines.get(projectId);
  if (existing && existing.getStatus().phase !== "complete" && existing.getStatus().phase !== "error") {
    return existing;
  }
  const pipeline = new SmartPipeline(config);
  activePipelines.set(projectId, pipeline);
  return pipeline;
}

export function getSmartPipeline(projectId: string): SmartPipeline | null {
  return activePipelines.get(projectId) || null;
}

export function isSmartBuildActive(projectId: string): boolean {
  const pipeline = activePipelines.get(projectId);
  if (!pipeline) return false;
  const status = pipeline.getStatus();
  return status.phase !== "idea" && status.phase !== "complete" && status.phase !== "error";
}
