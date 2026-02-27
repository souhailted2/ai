import { z } from "zod";
import type { ToolResult } from "../tools/registry";
import { toolRegistry } from "../tools/registry";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_ROOT = path.resolve("workspace");

export class ResearchAgent {
  private mode: "offline" | "online";

  constructor() {
    this.mode = process.env.SAFE_INTERNET_MODE === "true" ? "online" : "offline";
  }

  getMode(): "offline" | "online" {
    return this.mode;
  }

  setMode(mode: "offline" | "online"): void {
    this.mode = mode;
  }

  async searchDocs(query: string): Promise<ToolResult> {
    try {
      const results: string[] = [];
      const searchTerms = query.toLowerCase().split(/\s+/);

      const scanDir = (dir: string, depth: number = 0): void => {
        if (depth > 4 || results.length >= 10) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= 10) break;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (entry.name === "node_modules" || entry.name === ".git") continue;
              scanDir(fullPath, depth + 1);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if ([".md", ".txt", ".json", ".html"].includes(ext) ||
                  entry.name.toLowerCase() === "readme" ||
                  entry.name.toLowerCase().includes("doc")) {
                try {
                  const content = fs.readFileSync(fullPath, "utf-8");
                  const contentLower = content.toLowerCase();
                  const matches = searchTerms.filter(term => contentLower.includes(term));
                  if (matches.length > 0) {
                    const relativePath = path.relative(WORKSPACE_ROOT, fullPath);
                    const snippet = extractSnippet(content, matches[0], 200);
                    results.push(`[${relativePath}]\n  Match: ${matches.join(", ")}\n  Snippet: ${snippet}`);
                  }
                } catch {}
              }
            }
          }
        } catch {}
      };

      scanDir(WORKSPACE_ROOT);

      if (results.length === 0) {
        return { success: true, output: `No local documentation found matching "${query}".` };
      }

      return {
        success: true,
        output: `Found ${results.length} matching document(s) for "${query}":\n\n${results.join("\n\n")}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `searchDocs error: ${err.message}` };
    }
  }

  async analyzeRepo(url: string): Promise<ToolResult> {
    if (this.mode === "offline") {
      return {
        success: false,
        output: "",
        error: "Online mode is disabled. Enable SAFE_INTERNET_MODE to analyze remote repositories.",
      };
    }

    try {
      const readmeUrls = buildGitHubReadmeUrls(url);
      let readmeContent = "";

      for (const readmeUrl of readmeUrls) {
        const result = await toolRegistry.execute("fetchUrl", { url: readmeUrl });
        if (result.success && result.output && result.output.length > 50) {
          readmeContent = result.output;
          break;
        }
      }

      if (!readmeContent) {
        return { success: true, output: `Could not fetch README from ${url}. The repository may be private or the URL may be incorrect.` };
      }

      const summary = summarizeReadme(readmeContent, url);
      return {
        success: true,
        output: `[RESEARCH RESULT — Requires approval before applying]\n\nRepository: ${url}\n\n${summary}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `analyzeRepo error: ${err.message}` };
    }
  }

  async searchBestPractices(topic: string): Promise<ToolResult> {
    if (this.mode === "offline") {
      const offlineResult = getOfflineBestPractices(topic);
      return {
        success: true,
        output: `[OFFLINE BEST PRACTICES for "${topic}"]\n\n${offlineResult}`,
      };
    }

    try {
      const query = `${topic} best practices 2024`;
      const searchResult = await toolRegistry.execute("searchWeb", { query });

      if (!searchResult.success) {
        const offlineResult = getOfflineBestPractices(topic);
        return {
          success: true,
          output: `[OFFLINE FALLBACK — Web search failed]\n\n${offlineResult}`,
        };
      }

      return {
        success: true,
        output: `[RESEARCH RESULT — Requires approval before applying]\n\nBest practices for "${topic}":\n\n${searchResult.output}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `searchBestPractices error: ${err.message}` };
    }
  }

  async searchTechQuestion(question: string, topic: string): Promise<ToolResult> {
    const extractKeyTerms = (text: string): string[] => {
      const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to", "for", "of", "with", "by", "from", "and", "or", "but", "not", "this", "that", "what", "which", "how", "why", "when", "where", "do", "does", "did", "can", "could", "should", "would", "will", "shall", "may", "might", "must", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "best", "way", "use", "using", "about",
        "في", "من", "على", "إلى", "عن", "مع", "هل", "ما", "لا", "أن", "هذا", "هذه", "التي", "الذي", "كيف", "لماذا", "متى", "أين", "واش", "شنو", "كيفاش", "علاش", "وين", "باش", "تاع", "نتاع", "ولا", "أفضل", "طريقة", "قارنلي", "شرحلي", "فهمني"
      ]);
      return text.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    };

    const keyTerms = extractKeyTerms(question);

    if (this.mode === "offline") {
      const offlineResult = getOfflineBestPractices(topic);
      return {
        success: true,
        output: `[OFFLINE FALLBACK]\n\n${offlineResult}`,
      };
    }

    try {
      const soQuery = encodeURIComponent(`${topic} ${keyTerms.slice(0, 3).join(" ")}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const soResponse = await fetch(
        `https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${soQuery}&site=stackoverflow&pagesize=5`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (soResponse.ok) {
        const soText = await soResponse.text();
        const soData = JSON.parse(soText);

        if (soData.items && soData.items.length > 0) {
          const results = soData.items.slice(0, 5).map((item: any, i: number) => {
            const title = (item.title || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&hellip;/g, "...");
            const excerpt = (item.excerpt || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&hellip;/g, "...").substring(0, 200);
            const url = item.question_id ? `https://stackoverflow.com/questions/${item.question_id}` : "";
            const score = item.score || 0;
            return `${i + 1}. ${title}\n   ${url}\n   Score: ${score} | ${excerpt}`;
          }).join("\n\n");

          let bestAnswer = "";
          const topQuestion = soData.items[0];
          if (topQuestion.question_id) {
            try {
              const ansCtrl = new AbortController();
              const ansTimeout = setTimeout(() => ansCtrl.abort(), 8000);
              const answerResponse = await fetch(
                `https://api.stackexchange.com/2.3/questions/${topQuestion.question_id}/answers?order=desc&sort=votes&site=stackoverflow&pagesize=1&filter=withbody`,
                { signal: ansCtrl.signal }
              );
              clearTimeout(ansTimeout);
              if (answerResponse.ok) {
                const answerText = await answerResponse.text();
                const answerData = JSON.parse(answerText);
                if (answerData.items && answerData.items.length > 0) {
                  const body = (answerData.items[0].body || "")
                    .replace(/<pre><code>/g, "\n```\n")
                    .replace(/<\/code><\/pre>/g, "\n```\n")
                    .replace(/<code>/g, "`")
                    .replace(/<\/code>/g, "`")
                    .replace(/<[^>]*>/g, "")
                    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&hellip;/g, "...")
                    .substring(0, 1500);
                  bestAnswer = `\n\n━━━ Top Answer (Score: ${answerData.items[0].score}) ━━━\n\n${body}`;
                }
              }
            } catch {
            }
          }

          return {
            success: true,
            output: `${results}${bestAnswer}`,
          };
        }
      }

      const offlineResult = getOfflineBestPractices(topic);
      return {
        success: true,
        output: `[OFFLINE FALLBACK]\n\n${offlineResult}`,
      };
    } catch (err: any) {
      const offlineResult = getOfflineBestPractices(topic);
      return {
        success: true,
        output: `[SEARCH FAILED — Offline fallback]\n\n${offlineResult}`,
      };
    }
  }

  async discoverTrends(technology: string): Promise<ToolResult> {
    if (this.mode === "offline") {
      return {
        success: true,
        output: `[OFFLINE MODE] Cannot discover trends for "${technology}" without internet access. Enable SAFE_INTERNET_MODE to search online.`,
      };
    }

    try {
      const query = `${technology} latest trends updates 2024`;
      const searchResult = await toolRegistry.execute("searchWeb", { query });

      if (!searchResult.success) {
        return {
          success: true,
          output: `Could not fetch trends for "${technology}". Search returned no results.`,
        };
      }

      return {
        success: true,
        output: `[RESEARCH RESULT — Requires approval before applying]\n\nTrends for "${technology}":\n\n${searchResult.output}`,
      };
    } catch (err: any) {
      return { success: false, output: "", error: `discoverTrends error: ${err.message}` };
    }
  }
}

export const researchAgent = new ResearchAgent();

export const researchDocsSchema = z.object({
  query: z.string().describe("Search query to find in local documentation and README files"),
});

export const researchDocsDescription = "Search local workspace documentation, README files, and text files for relevant information";

export async function researchDocsHandler(args: z.infer<typeof researchDocsSchema>): Promise<ToolResult> {
  return researchAgent.searchDocs(args.query);
}

export const researchGitHubSchema = z.object({
  url: z.string().describe("GitHub repository URL to analyze (e.g. https://github.com/user/repo)"),
});

export const researchGitHubDescription = "Analyze a GitHub repository by fetching its README and summarizing the architecture (requires online mode)";

export async function researchGitHubHandler(args: z.infer<typeof researchGitHubSchema>): Promise<ToolResult> {
  return researchAgent.analyzeRepo(args.url);
}

export const researchWebSchema = z.object({
  topic: z.string().describe("Topic to research best practices and trends for"),
});

export const researchWebDescription = "Search for best practices and trends about a technology topic (uses DuckDuckGo, requires online mode for web results)";

export async function researchWebHandler(args: z.infer<typeof researchWebSchema>): Promise<ToolResult> {
  return researchAgent.searchBestPractices(args.topic);
}

function extractSnippet(content: string, term: string, maxLength: number): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx === -1) return content.slice(0, maxLength) + "...";
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + maxLength);
  let snippet = content.slice(start, end).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  return snippet;
}

function buildGitHubReadmeUrls(url: string): string[] {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return [url];
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, "");
  return [
    `https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/README.md`,
    `https://raw.githubusercontent.com/${owner}/${cleanRepo}/master/README.md`,
    `https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/readme.md`,
    `https://raw.githubusercontent.com/${owner}/${cleanRepo}/master/readme.md`,
  ];
}

function summarizeReadme(content: string, url: string): string {
  const lines = content.split("\n");
  const sections: string[] = [];

  let title = "";
  for (const line of lines) {
    if (line.startsWith("# ") && !title) {
      title = line.replace("# ", "").trim();
      break;
    }
  }
  if (title) sections.push(`Project: ${title}`);

  const descLines = lines.slice(0, 20).filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("!") && !l.startsWith("["));
  if (descLines.length > 0) {
    sections.push(`Description: ${descLines.slice(0, 3).join(" ").slice(0, 300)}`);
  }

  const techKeywords = ["react", "vue", "angular", "node", "express", "next", "typescript", "javascript",
    "python", "django", "flask", "rust", "go", "docker", "kubernetes", "postgres", "mongodb",
    "redis", "graphql", "rest", "api", "tailwind", "webpack", "vite"];
  const contentLower = content.toLowerCase();
  const detectedTech = techKeywords.filter(t => contentLower.includes(t));
  if (detectedTech.length > 0) {
    sections.push(`Technologies detected: ${detectedTech.join(", ")}`);
  }

  const headings = lines.filter(l => l.startsWith("## ")).map(l => l.replace("## ", "").trim());
  if (headings.length > 0) {
    sections.push(`Sections: ${headings.slice(0, 10).join(", ")}`);
  }

  return sections.join("\n\n");
}

function getOfflineBestPractices(topic: string): string {
  const topicLower = topic.toLowerCase();
  const practices: Record<string, string> = {
    "react": "- Use functional components with hooks\n- Keep state minimal and derived\n- Use React.memo for expensive renders\n- Prefer composition over inheritance\n- Use proper key props in lists\n- Implement error boundaries\n- Use lazy loading for large components",
    "typescript": "- Enable strict mode\n- Prefer interfaces over types for objects\n- Use discriminated unions for state\n- Avoid 'any' type\n- Use generics for reusable code\n- Leverage type inference\n- Use readonly where applicable",
    "node": "- Use async/await over callbacks\n- Handle errors properly with try/catch\n- Use environment variables for config\n- Implement graceful shutdown\n- Use streaming for large data\n- Validate inputs with schemas\n- Follow 12-factor app principles",
    "css": "- Use CSS custom properties for theming\n- Follow BEM or utility-first methodology\n- Mobile-first responsive design\n- Minimize specificity conflicts\n- Use flexbox/grid for layouts\n- Avoid !important\n- Optimize for performance with will-change",
    "api": "- Use proper HTTP methods (GET, POST, PUT, DELETE)\n- Return consistent response formats\n- Implement pagination for lists\n- Version your API\n- Validate request bodies\n- Use proper status codes\n- Document endpoints",
    "security": "- Validate all inputs\n- Use parameterized queries\n- Implement CORS properly\n- Hash passwords with bcrypt\n- Use HTTPS everywhere\n- Sanitize outputs\n- Apply rate limiting",
    "testing": "- Write unit tests for business logic\n- Use integration tests for APIs\n- Mock external dependencies\n- Follow AAA pattern (Arrange, Act, Assert)\n- Aim for meaningful coverage\n- Test edge cases\n- Use snapshot testing sparingly",
  };

  for (const [key, value] of Object.entries(practices)) {
    if (topicLower.includes(key)) {
      return value;
    }
  }

  return `General best practices for "${topic}":\n- Follow established conventions and patterns\n- Write clean, readable code\n- Document complex logic\n- Handle errors gracefully\n- Consider performance implications\n- Write tests for critical paths\n- Keep dependencies up to date`;
}
