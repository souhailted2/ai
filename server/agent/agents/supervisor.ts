import { isCloudMode, generateResponseWithLLM } from "../../llm-router";
import { enhancedMemory } from "../memory/enhanced-memory";
import { createScratchpad } from "../memory/scratchpad";
import { EVOLVED_ROLES } from "../prompts/roles";

export type TaskComplexity = "simple" | "moderate" | "complex";

export interface SupervisorTask {
  id: string;
  description: string;
  assignedAgent: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
  dependencies: string[];
  priority: number;
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface DecompositionResult {
  tasks: SupervisorTask[];
  strategy: string;
  estimatedComplexity: TaskComplexity;
}

export interface SupervisorStatus {
  active: boolean;
  currentGoal: string | null;
  tasks: SupervisorTask[];
  strategy: string | null;
  complexity: TaskComplexity | null;
  progress: { completed: number; total: number; percentage: number };
}

const AGENT_CAPABILITIES: Record<string, { keywords: string[]; description: string; capabilities: string[] }> = {
  coordinator: {
    keywords: ["route", "understand", "classify", "greet", "help", "coordinate", "manage"],
    description: EVOLVED_ROLES.coordinator?.description || "Routes requests, understands user intent, manages conversation flow",
    capabilities: EVOLVED_ROLES.coordinator?.capabilities || [],
  },
  analyzer: {
    keywords: ["analyze", "plan", "architecture", "design", "requirements", "spec", "structure", "review"],
    description: EVOLVED_ROLES.analyzer?.description || "Analyzes requirements, plans architecture, reviews designs",
    capabilities: EVOLVED_ROLES.analyzer?.capabilities || [],
  },
  coder: {
    keywords: ["code", "build", "create", "generate", "implement", "html", "css", "javascript", "react", "frontend", "backend", "api", "database", "write"],
    description: EVOLVED_ROLES.coder?.description || "Generates production-ready code, builds features, implements functionality",
    capabilities: EVOLVED_ROLES.coder?.capabilities || [],
  },
  runner: {
    keywords: ["run", "execute", "test", "start", "launch", "npm", "deploy", "export", "shell"],
    description: EVOLVED_ROLES.runner?.description || "Exports and runs projects, executes commands, manages runtime",
    capabilities: EVOLVED_ROLES.runner?.capabilities || [],
  },
  debugger: {
    keywords: ["debug", "fix", "error", "bug", "issue", "problem", "crash", "broken", "diagnose", "troubleshoot"],
    description: EVOLVED_ROLES.debugger?.description || "Finds and fixes errors, diagnoses issues, suggests solutions",
    capabilities: EVOLVED_ROLES.debugger?.capabilities || [],
  },
  memory: {
    keywords: ["remember", "context", "history", "preference", "recall", "learn", "pattern", "memory"],
    description: EVOLVED_ROLES.memory?.description || "Remembers context, user preferences, learns from past interactions",
    capabilities: EVOLVED_ROLES.memory?.capabilities || [],
  },
  research: {
    keywords: ["search", "docs", "documentation", "repo", "github", "best practice", "trend", "discover"],
    description: EVOLVED_ROLES.research?.description || "Searches documentation, analyzes repositories, discovers best practices",
    capabilities: EVOLVED_ROLES.research?.capabilities || [],
  },
  "ui-designer": {
    keywords: ["layout", "design", "color", "scheme", "ux", "ui", "responsive", "styling", "accessibility"],
    description: EVOLVED_ROLES["ui-designer"]?.description || "Generates layouts, suggests UX improvements, creates color schemes",
    capabilities: EVOLVED_ROLES["ui-designer"]?.capabilities || [],
  },
  refactor: {
    keywords: ["refactor", "clean", "modernize", "smell", "complexity", "duplication", "improve code", "optimize code"],
    description: EVOLVED_ROLES.refactor?.description || "Analyzes code quality, identifies code smells, suggests improvements",
    capabilities: EVOLVED_ROLES.refactor?.capabilities || [],
  },
};

const COMPLEX_GOAL_PATTERNS = [
  /full[\s-]?stack/i,
  /e[\s-]?commerce/i,
  /social[\s-]?media/i,
  /dashboard\s+with/i,
  /complete\s+(app|application|website|platform)/i,
  /build\s+a\s+(full|complete|entire)/i,
  /multiple\s+(pages?|features?|components?)/i,
  /authentication\s+and/i,
  /with\s+(database|api|backend)\s+and/i,
  /متجر/,
  /موقع\s+كامل/,
  /تطبيق\s+متكامل/,
  /نظام\s+إدارة/,
  /منصة/,
  /application\s+complète/i,
  /site\s+complet/i,
];

export class SupervisorAgent {
  private currentGoal: string | null = null;
  private currentTasks: SupervisorTask[] = [];
  private currentStrategy: string | null = null;
  private currentComplexity: TaskComplexity | null = null;

  async decompose(goal: string): Promise<DecompositionResult> {
    this.currentGoal = goal;

    if (isCloudMode()) {
      try {
        const llmResult = await this.decomposeWithLLM(goal);
        if (llmResult) {
          this.currentTasks = llmResult.tasks;
          this.currentStrategy = llmResult.strategy;
          this.currentComplexity = llmResult.estimatedComplexity;
          return llmResult;
        }
      } catch {}
    }

    const result = this.decomposeOffline(goal);
    this.currentTasks = result.tasks;
    this.currentStrategy = result.strategy;
    this.currentComplexity = result.estimatedComplexity;
    return result;
  }

  assignAgent(task: SupervisorTask): string {
    const lower = task.description.toLowerCase();
    let bestAgent = "coder";
    let bestScore = 0;

    for (const [agentType, capabilities] of Object.entries(AGENT_CAPABILITIES)) {
      let score = 0;
      for (const keyword of capabilities.keywords) {
        if (lower.includes(keyword)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentType;
      }
    }

    return bestAgent;
  }

  monitorProgress(tasks: SupervisorTask[]): {
    completed: number;
    total: number;
    percentage: number;
    stalled: SupervisorTask[];
    nextUp: SupervisorTask | null;
  } {
    const completed = tasks.filter(t => t.status === "completed").length;
    const total = tasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const STALL_THRESHOLD_MS = 5 * 60 * 1000;
    const now = Date.now();
    const stalled = tasks.filter(t =>
      t.status === "in_progress" && t.startedAt && (now - t.startedAt > STALL_THRESHOLD_MS)
    );

    const completedIds = new Set(tasks.filter(t => t.status === "completed").map(t => t.id));
    const nextUp = tasks.find(t =>
      t.status === "pending" && t.dependencies.every(dep => completedIds.has(dep))
    ) || null;

    return { completed, total, percentage, stalled, nextUp };
  }

  async suggestEvolution(): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      const episodes = await enhancedMemory.getRecentEpisodes(20);

      if (episodes.length === 0) {
        suggestions.push("No build history yet. Start building projects to enable learning.");
        return suggestions;
      }

      const failedCount = episodes.filter(e => e.summary.includes("Success: false")).length;
      const successCount = episodes.filter(e => e.summary.includes("Success: true")).length;

      if (failedCount > successCount && episodes.length >= 3) {
        suggestions.push("High failure rate detected. Consider simpler task decomposition and more validation steps.");
      }

      const stacks = new Map<string, number>();
      for (const ep of episodes) {
        const stackMatch = ep.summary.match(/Stack:\s*(\w+)/);
        if (stackMatch) {
          stacks.set(stackMatch[1], (stacks.get(stackMatch[1]) || 0) + 1);
        }
      }
      if (stacks.size > 0) {
        const sorted = Array.from(stacks.entries()).sort((a, b) => b[1] - a[1]);
        suggestions.push(`Most used stack: ${sorted[0][0]} (${sorted[0][1]} builds). Consider optimizing templates for this stack.`);
      }

      if (episodes.length >= 5) {
        suggestions.push("Sufficient build history for pattern learning. Memory agent can extract reusable patterns.");
      }
    } catch {
      suggestions.push("Unable to analyze history. Memory system may need initialization.");
    }

    return suggestions;
  }

  isComplexGoal(text: string): boolean {
    return COMPLEX_GOAL_PATTERNS.some(p => p.test(text));
  }

  getStatus(): SupervisorStatus {
    const progress = this.currentTasks.length > 0
      ? this.monitorProgress(this.currentTasks)
      : { completed: 0, total: 0, percentage: 0 };

    return {
      active: this.currentGoal !== null,
      currentGoal: this.currentGoal,
      tasks: this.currentTasks,
      strategy: this.currentStrategy,
      complexity: this.currentComplexity,
      progress: {
        completed: progress.completed,
        total: progress.total,
        percentage: progress.percentage,
      },
    };
  }

  getCapabilities(): Record<string, { keywords: string[]; description: string; capabilities: string[] }> {
    return AGENT_CAPABILITIES;
  }

  reset(): void {
    this.currentGoal = null;
    this.currentTasks = [];
    this.currentStrategy = null;
    this.currentComplexity = null;
  }

  private decomposeOffline(goal: string): DecompositionResult {
    const lower = goal.toLowerCase();
    const complexity = this.estimateComplexity(lower);
    const tasks: SupervisorTask[] = [];
    let strategy = "";

    if (this.matchesAny(lower, ["e-commerce", "ecommerce", "متجر", "store", "shop", "boutique"])) {
      strategy = "E-commerce build: product catalog, cart, checkout flow";
      tasks.push(
        this.task("sup_1", "Analyze e-commerce requirements and define product schema", "analyzer", [], 1),
        this.task("sup_2", "Design page layout and navigation structure", "analyzer", ["sup_1"], 2),
        this.task("sup_3", "Build product listing page with grid/cards", "coder", ["sup_2"], 3),
        this.task("sup_4", "Implement shopping cart functionality", "coder", ["sup_3"], 4),
        this.task("sup_5", "Create checkout flow and order summary", "coder", ["sup_4"], 5),
        this.task("sup_6", "Add responsive styling and dark mode", "coder", ["sup_5"], 6),
        this.task("sup_7", "Test all pages and fix issues", "debugger", ["sup_6"], 7),
      );
    } else if (this.matchesAny(lower, ["dashboard", "لوحة تحكم", "tableau de bord", "admin panel"])) {
      strategy = "Dashboard build: metrics, charts, data tables, sidebar navigation";
      tasks.push(
        this.task("sup_1", "Analyze dashboard requirements and data model", "analyzer", [], 1),
        this.task("sup_2", "Design dashboard layout with sidebar and header", "analyzer", ["sup_1"], 2),
        this.task("sup_3", "Build sidebar navigation and routing", "coder", ["sup_2"], 3),
        this.task("sup_4", "Create metric cards and statistics display", "coder", ["sup_3"], 4),
        this.task("sup_5", "Implement data tables with sorting/filtering", "coder", ["sup_4"], 5),
        this.task("sup_6", "Add charts and data visualization", "coder", ["sup_5"], 6),
        this.task("sup_7", "Test and verify all components", "debugger", ["sup_6"], 7),
      );
    } else if (this.matchesAny(lower, ["social", "chat", "messaging", "دردشة", "تواصل"])) {
      strategy = "Social/Chat build: user profiles, messaging, feed, notifications";
      tasks.push(
        this.task("sup_1", "Analyze social app requirements", "analyzer", [], 1),
        this.task("sup_2", "Design user profile and feed layouts", "analyzer", ["sup_1"], 2),
        this.task("sup_3", "Build user profile components", "coder", ["sup_2"], 3),
        this.task("sup_4", "Implement message/post feed", "coder", ["sup_3"], 4),
        this.task("sup_5", "Add messaging or comment functionality", "coder", ["sup_4"], 5),
        this.task("sup_6", "Style and add responsive design", "coder", ["sup_5"], 6),
        this.task("sup_7", "Test interactions and fix issues", "debugger", ["sup_6"], 7),
      );
    } else if (this.matchesAny(lower, ["landing", "portfolio", "website", "موقع", "site web"])) {
      strategy = "Landing/Portfolio build: hero section, features, about, contact";
      tasks.push(
        this.task("sup_1", "Analyze landing page requirements", "analyzer", [], 1),
        this.task("sup_2", "Design page sections and content structure", "analyzer", ["sup_1"], 2),
        this.task("sup_3", "Build hero section and navigation", "coder", ["sup_2"], 3),
        this.task("sup_4", "Create feature sections and content blocks", "coder", ["sup_3"], 4),
        this.task("sup_5", "Add contact form and footer", "coder", ["sup_4"], 5),
        this.task("sup_6", "Apply styling, animations, and responsiveness", "coder", ["sup_5"], 6),
      );
    } else if (this.matchesAny(lower, ["api", "backend", "server", "سيرفر", "خادم"])) {
      strategy = "API/Backend build: routes, data models, validation, error handling";
      tasks.push(
        this.task("sup_1", "Analyze API requirements and define endpoints", "analyzer", [], 1),
        this.task("sup_2", "Design data models and schemas", "analyzer", ["sup_1"], 2),
        this.task("sup_3", "Implement core API routes", "coder", ["sup_2"], 3),
        this.task("sup_4", "Add validation and error handling", "coder", ["sup_3"], 4),
        this.task("sup_5", "Test endpoints and verify responses", "debugger", ["sup_4"], 5),
      );
    } else {
      strategy = complexity === "complex"
        ? "Complex project: full analysis, architecture, multi-phase build, testing"
        : complexity === "moderate"
        ? "Moderate project: analysis, build, style, test"
        : "Simple project: quick analysis and build";

      tasks.push(
        this.task("sup_1", "Analyze requirements and plan approach", "analyzer", [], 1),
        this.task("sup_2", "Generate project structure and main code", "coder", ["sup_1"], 2),
        this.task("sup_3", "Add styling and UI refinements", "coder", ["sup_2"], 3),
      );

      if (complexity !== "simple") {
        tasks.push(
          this.task("sup_4", "Add additional features and interactions", "coder", ["sup_3"], 4),
          this.task("sup_5", "Test and validate output", "debugger", ["sup_4"], 5),
        );
      }

      if (complexity === "complex") {
        tasks.push(
          this.task("sup_6", "Optimize and add responsive design", "coder", ["sup_5"], 6),
          this.task("sup_7", "Final review and fixes", "debugger", ["sup_6"], 7),
        );
      }
    }

    return { tasks, strategy, estimatedComplexity: complexity };
  }

  private async decomposeWithLLM(goal: string): Promise<DecompositionResult | null> {
    const agentList = Object.entries(AGENT_CAPABILITIES)
      .map(([name, cap]) => `- ${name}: ${cap.description}`)
      .join("\n");

    const systemPrompt = `You are a Supervisor AI (AI CEO) that decomposes complex software goals into ordered sub-tasks.

Available agents:
${agentList}

Return ONLY valid JSON:
{
  "strategy": "Brief description of the build strategy",
  "estimatedComplexity": "simple" | "moderate" | "complex",
  "tasks": [
    {
      "id": "sup_1",
      "description": "What this task does",
      "assignedAgent": "agent_type",
      "dependencies": [],
      "priority": 1
    }
  ]
}

Rules:
- Decompose into 3-8 ordered tasks
- Assign each task to the most appropriate agent
- Use dependencies to enforce execution order
- Priority 1 = highest`;

    const result = await generateResponseWithLLM(`Goal: ${goal}`, systemPrompt);
    if (!result) return null;

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.tasks)) return null;

      const tasks: SupervisorTask[] = parsed.tasks.map((t: any, i: number) => ({
        id: t.id || `sup_${i + 1}`,
        description: t.description || `Task ${i + 1}`,
        assignedAgent: t.assignedAgent || "coder",
        status: "pending" as const,
        dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
        priority: t.priority || i + 1,
      }));

      const complexity = (["simple", "moderate", "complex"].includes(parsed.estimatedComplexity)
        ? parsed.estimatedComplexity
        : "moderate") as TaskComplexity;

      return {
        tasks,
        strategy: parsed.strategy || "LLM-generated strategy",
        estimatedComplexity: complexity,
      };
    } catch {
      return null;
    }
  }

  private estimateComplexity(text: string): TaskComplexity {
    if (COMPLEX_GOAL_PATTERNS.some(p => p.test(text))) return "complex";

    const moderatePatterns = [
      /with\s+(auth|login|user)/i,
      /and\s+(style|design|theme)/i,
      /multiple/i,
      /several/i,
      /database/i,
      /بعدة/,
      /متعدد/,
    ];
    if (moderatePatterns.some(p => p.test(text))) return "moderate";

    return "simple";
  }

  private task(id: string, description: string, assignedAgent: string, dependencies: string[], priority: number): SupervisorTask {
    return { id, description, assignedAgent, status: "pending", dependencies, priority };
  }

  private matchesAny(text: string, keywords: string[]): boolean {
    return keywords.some(k => text.includes(k));
  }
}

export const supervisorAgent = new SupervisorAgent();
