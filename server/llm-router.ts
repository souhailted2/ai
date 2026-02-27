import type { ChatIntent, Dialect } from "./agents-v3";

const LLM_MODE = process.env.LLM_MODE || "offline";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function isCloudMode(): boolean {
  return LLM_MODE === "cloud" && (!!OPENAI_API_KEY || !!GROQ_API_KEY);
}

export function getLLMStatus(): { mode: string; provider: string | null; model: string | null; available: boolean } {
  if (!isCloudMode()) {
    return { mode: "offline", provider: null, model: null, available: false };
  }
  if (GROQ_API_KEY) {
    return { mode: "cloud", provider: "groq", model: GROQ_MODEL, available: true };
  }
  return { mode: "cloud", provider: "openai", model: OPENAI_MODEL, available: true };
}

interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getClientConfig(): ClientConfig | null {
  if (!isCloudMode()) return null;
  if (GROQ_API_KEY) {
    return { baseUrl: GROQ_BASE_URL, apiKey: GROQ_API_KEY, model: GROQ_MODEL };
  }
  if (OPENAI_API_KEY) {
    return { baseUrl: OPENAI_BASE_URL, apiKey: OPENAI_API_KEY, model: OPENAI_MODEL };
  }
  return null;
}

async function callLLM(messages: { role: string; content: string }[], config: ClientConfig): Promise<string | null> {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      console.warn(`LLM API returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.warn("LLM API call failed, falling back to offline mode:", err);
    return null;
  }
}

const VALID_INTENTS: ChatIntent[] = [
  "build-new", "explain-code", "fix-error", "improve",
  "add-feature", "change-style", "question", "rebuild",
  "translate", "document", "greeting", "status",
  "help", "thanks", "affirmative", "negative",
  "use-image", "show-files", "open-file", "edit-file",
  "run", "deploy", "settings", "cancel", "reset", "summarize",
  "execute", "unknown"
];

export async function classifyIntentWithLLM(text: string, dialect: Dialect): Promise<ChatIntent | null> {
  const config = getClientConfig();
  if (!config) return null;

  try {
    const systemPrompt = `You are an intent classifier for a multilingual AI code builder. Classify user messages into exactly one intent.

Valid intents: ${VALID_INTENTS.join(", ")}

Intent descriptions:
- build-new: User wants to create/build/generate a new project or app
- explain-code: User wants code explained
- fix-error: User reports a bug, error, or something not working
- improve: User wants to optimize or improve code
- add-feature: User wants to add a new feature
- change-style: User wants to change design/colors/theme/layout
- question: User asks a general question
- rebuild: User wants to rebuild/redo from scratch
- translate: User wants to translate code or UI
- document: User wants documentation
- greeting: User says hello/hi
- status: User asks about project status
- help: User asks for help or capabilities
- thanks: User expresses gratitude
- affirmative: User says yes/ok/agree
- negative: User says no/cancel/disagree
- use-image: User wants to use an uploaded image
- show-files: User wants to see project files list
- open-file: User wants to open or view a specific file
- edit-file: User wants to edit a specific file
- run: User wants to run/execute the project or a command
- deploy: User wants to deploy the project
- settings: User wants to view or change settings
- cancel: User wants to cancel current operation
- reset: User wants to reset the project or conversation
- summarize: User wants a summary of the project
- execute: User wants to execute a task autonomously using the agent loop

The user may write in Arabic (including Darija/Algerian dialect), French, or English.
Respond with ONLY the intent name, nothing else.`;

    const result = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ], config);

    if (result) {
      const cleaned = result.trim().toLowerCase().replace(/['"]/g, "");
      if (VALID_INTENTS.includes(cleaned as ChatIntent)) {
        return cleaned as ChatIntent;
      }
    }
    return null;
  } catch (err) {
    console.warn("LLM intent classification failed:", err);
    return null;
  }
}

export interface LLMAnalysis {
  type: string;
  name: string;
  features: string[];
  tech: string[];
  complexity: "simple" | "medium" | "complex";
  confidence: number;
  summary: string;
}

export async function analyzeWithLLM(text: string, dialect: Dialect): Promise<LLMAnalysis | null> {
  const config = getClientConfig();
  if (!config) return null;

  try {
    const systemPrompt = `You are a project analyzer for an AI code builder. Analyze the user's project request and return a JSON object.

The user may write in Arabic (including Darija/Algerian dialect), French, or English.

Return ONLY valid JSON with this structure:
{
  "type": "web-app|game|api|dashboard|landing|ecommerce|blog|chat|calculator|todo|notes|portfolio|other",
  "name": "suggested project name",
  "features": ["feature1", "feature2", ...],
  "tech": ["html", "css", "javascript", ...],
  "complexity": "simple|medium|complex",
  "confidence": 0.0-1.0,
  "summary": "Brief description of what will be built (in the same language as the user's request)"
}

Confidence should reflect how well you understand the request:
- 1.0: Very clear, specific request
- 0.7-0.9: Mostly clear with some assumptions
- 0.5-0.7: Vague, needs clarification
- <0.5: Very unclear`;

    const result = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ], config);

    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          type: parsed.type || "other",
          name: parsed.name || "Project",
          features: Array.isArray(parsed.features) ? parsed.features : [],
          tech: Array.isArray(parsed.tech) ? parsed.tech : [],
          complexity: ["simple", "medium", "complex"].includes(parsed.complexity) ? parsed.complexity : "medium",
          confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
          summary: parsed.summary || "",
        };
      }
    }
    return null;
  } catch (err) {
    console.warn("LLM analysis failed:", err);
    return null;
  }
}

export async function answerTechQuestion(question: string, dialect: string): Promise<string | null> {
  const config = getClientConfig();
  if (!config) return null;

  const langHint = dialect === "dz" || dialect === "ar"
    ? "The user writes in Arabic/Darija. Answer in Arabic."
    : dialect === "fr"
      ? "The user writes in French. Answer in French."
      : "Answer in the same language as the question.";

  try {
    const result = await callLLM([
      {
        role: "system",
        content: `You are a senior software engineer and technical mentor. Answer programming and technical questions concisely and accurately. Provide practical examples when helpful. Use markdown formatting for code blocks. ${langHint}`,
      },
      { role: "user", content: question },
    ], { ...config, model: config.model });

    return result;
  } catch (err) {
    console.warn("LLM tech question answer failed:", err);
    return null;
  }
}

export async function generateResponseWithLLM(prompt: string, systemPrompt: string): Promise<string | null> {
  const config = getClientConfig();
  if (!config) return null;

  try {
    const result = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ], config);

    return result;
  } catch (err) {
    console.warn("LLM response generation failed:", err);
    return null;
  }
}
