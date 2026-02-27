import { enhancedMemory } from "../memory/enhanced-memory";
import { storage } from "../../storage";

export interface BuildPattern {
  projectType: string;
  stack: string;
  architecture: string;
  timestamp: number;
  success: boolean;
  features: string[];
}

export interface SessionSummary {
  sessionId: string;
  timestamp: number;
  projectId: string;
  actions: string[];
  outcome: string;
  lessonsLearned: string[];
}

export interface HistorySuggestion {
  approach: string;
  confidence: number;
  basedOn: string[];
  recommendedStack: string;
  patterns: string[];
}

export class MemoryAgent {
  async extractPatterns(buildHistory: Array<{ projectId: string; spec: string; result: string; stack: string; success: boolean }>): Promise<BuildPattern[]> {
    const patterns: BuildPattern[] = [];
    const typeFrequency = new Map<string, number>();
    const stackFrequency = new Map<string, number>();

    for (const build of buildHistory) {
      const projectType = this.detectProjectType(build.spec);
      const features = this.extractFeatures(build.spec);
      const architecture = this.detectArchitecture(build.spec, build.stack);

      const pattern: BuildPattern = {
        projectType,
        stack: build.stack,
        architecture,
        timestamp: Date.now(),
        success: build.success,
        features,
      };
      patterns.push(pattern);

      typeFrequency.set(projectType, (typeFrequency.get(projectType) || 0) + 1);
      stackFrequency.set(build.stack, (stackFrequency.get(build.stack) || 0) + 1);
    }

    await enhancedMemory.addLongTerm("patterns:extracted", JSON.stringify(patterns));
    await enhancedMemory.addLongTerm("patterns:type_frequency", JSON.stringify(Object.fromEntries(typeFrequency)));
    await enhancedMemory.addLongTerm("patterns:stack_frequency", JSON.stringify(Object.fromEntries(stackFrequency)));

    return patterns;
  }

  async summarizeSession(projectId: string, actions: string[], outcome: string): Promise<SessionSummary> {
    const sessionId = `session_${Date.now()}`;
    const lessonsLearned = this.deriveLessons(actions, outcome);

    const summary: SessionSummary = {
      sessionId,
      timestamp: Date.now(),
      projectId,
      actions,
      outcome,
      lessonsLearned,
    };

    await enhancedMemory.addEpisode(sessionId, JSON.stringify(summary), projectId);
    await enhancedMemory.addLongTerm(`session:${sessionId}`, JSON.stringify(summary));

    return summary;
  }

  async suggestFromHistory(newRequest: string): Promise<HistorySuggestion> {
    const projectType = this.detectProjectType(newRequest);
    const preferredStack = await enhancedMemory.getPreferredStack(projectType);
    const successfulPatterns = await enhancedMemory.getSuccessfulPatterns(projectType);
    const frequentTypes = await enhancedMemory.getFrequentProjectTypes();

    const basedOn: string[] = [];
    const patterns: string[] = [];
    let confidence = 0.3;

    if (successfulPatterns.length > 0) {
      basedOn.push(`${successfulPatterns.length} successful past builds of type "${projectType}"`);
      for (const p of successfulPatterns) {
        patterns.push(`${p.architecture} with ${p.features.join(", ")}`);
      }
      confidence += 0.3;
    }

    if (preferredStack) {
      basedOn.push(`User prefers "${preferredStack}" for ${projectType} projects`);
      confidence += 0.2;
    }

    const typeEntry = frequentTypes.find(t => t.type === projectType);
    if (typeEntry && typeEntry.count > 2) {
      basedOn.push(`User has built ${typeEntry.count} "${projectType}" projects before`);
      confidence += 0.1;
    }

    let approach = `Build a ${projectType} project`;
    if (preferredStack) {
      approach += ` using ${preferredStack}`;
    }
    if (successfulPatterns.length > 0) {
      approach += ` following the ${successfulPatterns[0].architecture} architecture pattern`;
    }

    return {
      approach,
      confidence: Math.min(confidence, 1.0),
      basedOn,
      recommendedStack: preferredStack || "html-app",
      patterns,
    };
  }

  private detectProjectType(spec: string): string {
    const lower = spec.toLowerCase();
    const typeKeywords: Record<string, string[]> = {
      "game": ["game", "play", "score", "level", "player", "لعبة", "لعب"],
      "dashboard": ["dashboard", "analytics", "charts", "metrics", "لوحة تحكم", "إحصائيات"],
      "ecommerce": ["shop", "store", "cart", "product", "price", "متجر", "تسوق", "سلة"],
      "blog": ["blog", "post", "article", "content", "مدونة", "مقال"],
      "chat": ["chat", "message", "conversation", "دردشة", "رسائل"],
      "todo": ["todo", "task", "list", "مهام", "قائمة"],
      "portfolio": ["portfolio", "resume", "cv", "about me", "معرض أعمال", "سيرة"],
      "api": ["api", "rest", "endpoint", "server", "خادم"],
      "landing": ["landing", "homepage", "صفحة هبوط", "صفحة رئيسية"],
      "form": ["form", "survey", "registration", "signup", "نموذج", "تسجيل"],
      "social": ["social", "feed", "follow", "like", "اجتماعي", "متابعة"],
      "calculator": ["calculator", "calc", "math", "حاسبة", "آلة حاسبة"],
    };

    for (const [type, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some(k => lower.includes(k))) {
        return type;
      }
    }
    return "webapp";
  }

  private extractFeatures(spec: string): string[] {
    const lower = spec.toLowerCase();
    const featureKeywords: Record<string, string> = {
      "responsive": "responsive",
      "dark mode": "dark-mode",
      "animation": "animations",
      "auth": "authentication",
      "login": "authentication",
      "search": "search",
      "filter": "filtering",
      "sort": "sorting",
      "pagination": "pagination",
      "upload": "file-upload",
      "notification": "notifications",
      "real-time": "realtime",
      "websocket": "realtime",
      "drag": "drag-and-drop",
      "chart": "data-visualization",
      "graph": "data-visualization",
      "mobile": "mobile-friendly",
      "i18n": "internationalization",
      "multi-language": "internationalization",
    };

    const features: string[] = [];
    for (const [keyword, feature] of Object.entries(featureKeywords)) {
      if (lower.includes(keyword) && !features.includes(feature)) {
        features.push(feature);
      }
    }
    return features;
  }

  private detectArchitecture(spec: string, stack: string): string {
    if (stack.includes("react") && stack.includes("express")) return "full-stack-react";
    if (stack.includes("react")) return "spa-react";
    if (stack.includes("express") || stack.includes("api")) return "rest-api";
    if (stack.includes("canvas") || stack.includes("game")) return "canvas-game";
    if (stack.includes("html")) return "static-html";
    return "general-webapp";
  }

  private deriveLessons(actions: string[], outcome: string): string[] {
    const lessons: string[] = [];
    const outcomeLower = outcome.toLowerCase();

    if (outcomeLower.includes("success") || outcomeLower.includes("ready")) {
      lessons.push("Build completed successfully");
      if (actions.length > 10) {
        lessons.push("Complex build required multiple iterations");
      }
      if (actions.length <= 3) {
        lessons.push("Simple build completed quickly");
      }
    }

    if (outcomeLower.includes("error") || outcomeLower.includes("fix")) {
      lessons.push("Build encountered errors requiring debugging");
    }

    if (actions.some(a => a.includes("refactor"))) {
      lessons.push("Refactoring was needed during build");
    }

    if (actions.some(a => a.includes("style") || a.includes("css"))) {
      lessons.push("Styling adjustments were part of the process");
    }

    return lessons;
  }
}

export const memoryAgent = new MemoryAgent();
