import { storage } from "../../storage";

export interface MemoryEntry {
  key: string;
  value: string;
  layer: "working" | "short_term" | "long_term" | "episodic";
  timestamp: number;
  ttl?: number;
}

export interface EpisodeEntry {
  runId: string;
  summary: string;
  timestamp: number;
  projectId: string;
}

export interface RetrievalResult {
  key: string;
  value: string;
  layer: string;
  relevance: number;
}

export class EnhancedMemory {
  private workingMemory: Map<string, { value: string; timestamp: number; ttl: number }> = new Map();
  private readonly DEFAULT_WORKING_TTL = 30 * 60 * 1000;
  private readonly DEFAULT_SHORT_TERM_TTL = 24 * 60 * 60 * 1000;

  addWorkingMemory(key: string, value: string, ttlMs?: number): void {
    const ttl = ttlMs ?? this.DEFAULT_WORKING_TTL;
    this.workingMemory.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
    this.cleanExpiredWorking();
  }

  getWorkingMemory(key: string): string | null {
    const entry = this.workingMemory.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.workingMemory.delete(key);
      return null;
    }
    return entry.value;
  }

  getAllWorkingMemory(): Map<string, string> {
    this.cleanExpiredWorking();
    const result = new Map<string, string>();
    const entries = Array.from(this.workingMemory.entries());
    for (let i = 0; i < entries.length; i++) {
      result.set(entries[i][0], entries[i][1].value);
    }
    return result;
  }

  clearWorkingMemory(): void {
    this.workingMemory.clear();
  }

  async addShortTerm(key: string, value: string): Promise<void> {
    const prefixedKey = `st:${key}`;
    const payload = JSON.stringify({
      value,
      createdAt: Date.now(),
      ttl: this.DEFAULT_SHORT_TERM_TTL,
    });
    await storage.setMemory(prefixedKey, payload, "short_term");
  }

  async getShortTerm(key: string): Promise<string | null> {
    const prefixedKey = `st:${key}`;
    const mem = await storage.getMemory(prefixedKey);
    if (!mem) return null;
    try {
      const data = JSON.parse(mem.value);
      if (Date.now() - data.createdAt > data.ttl) {
        await storage.deleteMemory(prefixedKey);
        return null;
      }
      return data.value;
    } catch {
      return mem.value;
    }
  }

  async addLongTerm(key: string, value: string): Promise<void> {
    const prefixedKey = `lt:${key}`;
    await storage.setMemory(prefixedKey, value, "long_term");
  }

  async getLongTerm(key: string): Promise<string | null> {
    const prefixedKey = `lt:${key}`;
    const mem = await storage.getMemory(prefixedKey);
    return mem?.value ?? null;
  }

  async addEpisode(runId: string, summary: string, projectId?: string): Promise<void> {
    const episodeKey = `ep:${runId}`;
    const episode: EpisodeEntry = {
      runId,
      summary,
      timestamp: Date.now(),
      projectId: projectId ?? "unknown",
    };
    await storage.setMemory(episodeKey, JSON.stringify(episode), "episodic");
  }

  async getEpisode(runId: string): Promise<EpisodeEntry | null> {
    const mem = await storage.getMemory(`ep:${runId}`);
    if (!mem) return null;
    try {
      return JSON.parse(mem.value) as EpisodeEntry;
    } catch {
      return null;
    }
  }

  async getRecentEpisodes(limit: number = 10): Promise<EpisodeEntry[]> {
    const allEpisodic = await storage.getMemoriesByCategory("episodic");
    const episodes: EpisodeEntry[] = [];
    for (const mem of allEpisodic) {
      try {
        episodes.push(JSON.parse(mem.value) as EpisodeEntry);
      } catch {
        continue;
      }
    }
    episodes.sort((a, b) => b.timestamp - a.timestamp);
    return episodes.slice(0, limit);
  }

  async retrieve(query: string): Promise<RetrievalResult[]> {
    const results: RetrievalResult[] = [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

    this.cleanExpiredWorking();
    const workingEntries = Array.from(this.workingMemory.entries());
    for (let i = 0; i < workingEntries.length; i++) {
      const [key, entry] = workingEntries[i];
      const relevance = this.computeRelevance(queryTerms, key, entry.value);
      if (relevance > 0) {
        results.push({ key, value: entry.value, layer: "working", relevance: relevance + 0.3 });
      }
    }

    const shortTermMems = await storage.getMemoriesByCategory("short_term");
    for (const mem of shortTermMems) {
      let value = mem.value;
      try {
        const parsed = JSON.parse(mem.value);
        if (parsed.value) {
          if (Date.now() - parsed.createdAt > parsed.ttl) continue;
          value = parsed.value;
        }
      } catch {}
      const relevance = this.computeRelevance(queryTerms, mem.key, value);
      if (relevance > 0) {
        results.push({ key: mem.key, value, layer: "short_term", relevance: relevance + 0.2 });
      }
    }

    const longTermMems = await storage.getMemoriesByCategory("long_term");
    for (const mem of longTermMems) {
      const relevance = this.computeRelevance(queryTerms, mem.key, mem.value);
      if (relevance > 0) {
        results.push({ key: mem.key, value: mem.value, layer: "long_term", relevance: relevance + 0.1 });
      }
    }

    const episodicMems = await storage.getMemoriesByCategory("episodic");
    for (const mem of episodicMems) {
      const relevance = this.computeRelevance(queryTerms, mem.key, mem.value);
      if (relevance > 0) {
        results.push({ key: mem.key, value: mem.value, layer: "episodic", relevance });
      }
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, 20);
  }

  private computeRelevance(queryTerms: string[], key: string, value: string): number {
    const combined = `${key} ${value}`.toLowerCase();
    let matches = 0;
    for (const term of queryTerms) {
      if (combined.includes(term)) matches++;
    }
    if (queryTerms.length === 0) return 0;
    return matches / queryTerms.length;
  }

  async learnFromBuild(projectId: string, spec: string, result: { success: boolean; stack: string; features?: string[] }): Promise<void> {
    const projectType = this.detectProjectType(spec);
    const buildRecord = {
      projectId,
      spec,
      projectType,
      stack: result.stack,
      success: result.success,
      features: result.features || [],
      timestamp: Date.now(),
    };

    const historyKey = `lt:build_history`;
    const existing = await storage.getMemory(historyKey);
    let history: any[] = [];
    if (existing) {
      try {
        history = JSON.parse(existing.value);
      } catch {}
    }
    history.push(buildRecord);
    await storage.setMemory(historyKey, JSON.stringify(history), "long_term");

    const typeCountKey = `lt:type_count:${projectType}`;
    const existingCount = await storage.getMemory(typeCountKey);
    const count = existingCount ? parseInt(existingCount.value, 10) + 1 : 1;
    await storage.setMemory(typeCountKey, String(count), "long_term");

    const stackCountKey = `lt:stack_count:${result.stack}`;
    const existingStackCount = await storage.getMemory(stackCountKey);
    const stackCount = existingStackCount ? parseInt(existingStackCount.value, 10) + 1 : 1;
    await storage.setMemory(stackCountKey, String(stackCount), "long_term");

    if (result.success) {
      const patternKey = `lt:successful_pattern:${projectType}:${Date.now()}`;
      await storage.setMemory(patternKey, JSON.stringify(buildRecord), "long_term");
    }
  }

  async getPreferredStack(projectType: string): Promise<string | null> {
    const historyKey = `lt:build_history`;
    const existing = await storage.getMemory(historyKey);
    if (!existing) return null;

    let history: any[] = [];
    try {
      history = JSON.parse(existing.value);
    } catch {
      return null;
    }

    const relevantBuilds = history.filter(
      (b: any) => b.projectType === projectType && b.success
    );
    if (relevantBuilds.length === 0) return null;

    const stackCounts = new Map<string, number>();
    for (const build of relevantBuilds) {
      stackCounts.set(build.stack, (stackCounts.get(build.stack) || 0) + 1);
    }

    let bestStack = "";
    let bestCount = 0;
    const stackEntries = Array.from(stackCounts.entries());
    for (let i = 0; i < stackEntries.length; i++) {
      if (stackEntries[i][1] > bestCount) {
        bestStack = stackEntries[i][0];
        bestCount = stackEntries[i][1];
      }
    }
    return bestStack || null;
  }

  async getSuccessfulPatterns(projectType: string): Promise<Array<{ architecture: string; features: string[]; stack: string }>> {
    const allLongTerm = await storage.getMemoriesByCategory("long_term");
    const patterns: Array<{ architecture: string; features: string[]; stack: string }> = [];

    for (const mem of allLongTerm) {
      if (mem.key.startsWith(`lt:successful_pattern:${projectType}:`)) {
        try {
          const record = JSON.parse(mem.value);
          patterns.push({
            architecture: this.detectArchitecture(record.stack),
            features: record.features || [],
            stack: record.stack,
          });
        } catch {
          continue;
        }
      }
    }

    return patterns;
  }

  async getFrequentProjectTypes(): Promise<Array<{ type: string; count: number }>> {
    const allLongTerm = await storage.getMemoriesByCategory("long_term");
    const types: Array<{ type: string; count: number }> = [];

    for (const mem of allLongTerm) {
      if (mem.key.startsWith("lt:type_count:")) {
        const type = mem.key.replace("lt:type_count:", "");
        const count = parseInt(mem.value, 10);
        if (!isNaN(count)) {
          types.push({ type, count });
        }
      }
    }

    types.sort((a, b) => b.count - a.count);
    return types;
  }

  private detectProjectType(spec: string): string {
    const lower = spec.toLowerCase();
    const typeKeywords: Record<string, string[]> = {
      "game": ["game", "play", "score", "level", "player", "لعبة"],
      "dashboard": ["dashboard", "analytics", "charts", "metrics", "لوحة تحكم"],
      "ecommerce": ["shop", "store", "cart", "product", "price", "متجر"],
      "blog": ["blog", "post", "article", "مدونة"],
      "chat": ["chat", "message", "conversation", "دردشة"],
      "todo": ["todo", "task", "list", "مهام"],
      "portfolio": ["portfolio", "resume", "cv", "معرض أعمال"],
      "api": ["api", "rest", "endpoint", "server"],
      "landing": ["landing", "homepage", "صفحة هبوط"],
      "calculator": ["calculator", "calc", "math", "حاسبة"],
    };

    for (const [type, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some(k => lower.includes(k))) return type;
    }
    return "webapp";
  }

  private detectArchitecture(stack: string): string {
    if (stack.includes("react") && stack.includes("express")) return "full-stack-react";
    if (stack.includes("react")) return "spa-react";
    if (stack.includes("express") || stack.includes("api")) return "rest-api";
    if (stack.includes("canvas") || stack.includes("game")) return "canvas-game";
    if (stack.includes("html")) return "static-html";
    return "general-webapp";
  }

  private cleanExpiredWorking(): void {
    const now = Date.now();
    const keys = Array.from(this.workingMemory.keys());
    for (let i = 0; i < keys.length; i++) {
      const entry = this.workingMemory.get(keys[i]);
      if (entry && now - entry.timestamp > entry.ttl) {
        this.workingMemory.delete(keys[i]);
      }
    }
  }
}

export const enhancedMemory = new EnhancedMemory();
