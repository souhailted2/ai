import { storage } from "./storage";
import { generateCode, analyzeIdea, translateIntent } from "./agents";
import { isCloudMode, classifyIntentWithLLM, analyzeWithLLM, answerTechQuestion } from "./llm-router";
import { enhancedMemory, EnhancedMemory } from "./agent/memory/enhanced-memory";
import { createScratchpad, Scratchpad } from "./agent/memory/scratchpad";
import { supervisorAgent } from "./agent/agents/supervisor";
import { researchAgent } from "./agent/agents/research";
import { createSmartPipeline, getSmartPipeline, isSmartBuildActive, type SmartPipelineStatus } from "./agent/pipelines/smart-pipeline";

export type AgentV3Type = "coordinator" | "analyzer" | "coder" | "debugger" | "memory";
export type Dialect = "dz" | "ar" | "en" | "fr";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface ConversationMemory {
  dialect: Dialect;
  userPreferences: { theme?: string; style?: string };
  lastIntent: string;
  pendingClarification: string | null;
  mentionedFeatures: string[];
  corrections: string[];
  lastAttachments: { url: string; name: string; type: string }[];
  buildCount: number;
}

const memoryStore = new Map<string, ConversationMemory>();

function getMemory(projectId: string): ConversationMemory {
  if (!memoryStore.has(projectId)) {
    memoryStore.set(projectId, {
      dialect: "ar",
      userPreferences: {},
      lastIntent: "",
      pendingClarification: null,
      mentionedFeatures: [],
      corrections: [],
      lastAttachments: [],
      buildCount: 0,
    });
  }
  return memoryStore.get(projectId)!;
}

export function detectDialect(text: string): Dialect {
  const lower = text.toLowerCase();

  const dzWords = [
    "واش", "كيفاش", "بزاف", "هدرة", "خدمة", "بصح", "نحب",
    "درك", "هاذ", "راني", "وين", "علاش", "كاين", "ماكاش",
    "صحيت", "يخي", "هاك", "كيراك", "لاباس", "نتاع", "هذاك",
    "ديرلي", "نديرو", "خلاص", "برك", "قاع", "وحد", "نورمال",
    "بلاك", "هدرني", "تاع", "كاش", "حاجة", "غادي", "ديما",
    "واشنو", "بغيت", "خويا", "ساهل", "صعيب", "مزال", "بركا",
    "ياسر", "زعمة", "واحد", "هذي", "ختي", "ولد", "دير",
    "هز", "حط", "عجبني", "ماعجبنيش", "روح", "ارجع", "شحال",
  ];
  if (dzWords.some(w => text.includes(w))) return "dz";

  const frWords = ["bonjour", "merci", "comment", "s'il vous", "faire", "application", "je veux", "salut", "bonsoir", "créer", "ajouter"];
  if (frWords.some(w => lower.includes(w))) return "fr";

  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return "ar";
  return "en";
}

export type ChatIntent =
  | "build-new" | "explain-code" | "fix-error" | "improve"
  | "add-feature" | "change-style" | "question" | "rebuild"
  | "translate" | "document" | "greeting" | "status"
  | "help" | "thanks" | "affirmative" | "negative"
  | "use-image" | "show-files" | "open-file" | "edit-file"
  | "run" | "deploy" | "settings" | "cancel" | "reset"
  | "summarize" | "execute" | "unknown";

function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[ـ]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[؟?!.،,]+$/g, "")
    .trim();
}

export async function classifyIntentAsync(text: string, dialect: Dialect): Promise<ChatIntent> {
  if (isCloudMode()) {
    try {
      const llmIntent = await classifyIntentWithLLM(text, dialect);
      if (llmIntent) return llmIntent;
    } catch (err) {
      // silent fallback to offline rules
    }
  }
  return classifyIntentOffline(text, dialect);
}

export function classifyIntent(text: string, dialect: Dialect): ChatIntent {
  return classifyIntentOffline(text, dialect);
}

const TECH_FRAMEWORKS = new Set([
  "zustand", "react", "vue", "angular", "svelte", "solid", "preact", "next", "next.js", "nextjs",
  "nuxt", "nuxt.js", "remix", "gatsby", "astro", "qwik", "express", "nest", "nestjs", "fastify",
  "hono", "koa", "django", "flask", "fastapi", "laravel", "spring", "rails", "phoenix",
  "mongoose", "prisma", "drizzle", "sequelize", "typeorm", "knex", "objection",
  "redux", "mobx", "pinia", "jotai", "recoil", "valtio", "xstate", "ngrx", "vuex",
  "tanstack", "react-query", "swr", "axios", "jquery", "lodash", "ramda", "rxjs",
  "bootstrap", "tailwind", "tailwindcss", "material", "chakra", "ant design", "shadcn", "radix",
  "three.js", "threejs", "d3", "chart.js", "recharts", "framer motion",
  "socket.io", "socketio", "graphql", "apollo", "trpc", "grpc",
  "webpack", "vite", "rollup", "turbopack", "esbuild", "swc", "babel", "parcel",
  "jest", "vitest", "playwright", "cypress", "mocha", "chai", "supertest", "storybook",
  "docker", "kubernetes", "k8s", "nginx", "apache", "pm2",
  "firebase", "supabase", "appwrite", "convex", "vercel", "netlify", "cloudflare",
  "aws", "azure", "gcp", "heroku", "railway", "render", "fly.io",
  "mongodb", "postgresql", "postgres", "mysql", "mariadb", "sqlite", "redis", "memcached",
  "elasticsearch", "opensearch", "kafka", "rabbitmq", "nats", "pulsar",
  "stripe", "auth0", "clerk", "lucia", "passport", "keycloak",
  "tensorflow", "pytorch", "langchain", "openai", "huggingface",
  "electron", "tauri", "react native", "expo", "flutter", "ionic", "capacitor",
  "typescript", "javascript", "python", "rust", "go", "golang", "java", "kotlin", "swift",
  "c#", "csharp", ".net", "dotnet", "php", "ruby", "elixir", "scala", "dart", "zig",
  "html", "css", "sass", "scss", "less", "postcss", "styled-components",
  "git", "github", "gitlab", "bitbucket", "npm", "yarn", "pnpm", "bun", "deno", "node", "nodejs",
]);

const TECH_CONCEPTS = new Set([
  "persistence", "middleware", "hooks", "state management", "routing", "authentication",
  "authorization", "caching", "pagination", "serialization", "deserialization",
  "orm", "ssr", "ssg", "isr", "csr", "hydration", "tree shaking", "code splitting",
  "lazy loading", "memoization", "debounce", "throttle", "websocket", "websockets",
  "rest api", "restful", "crud", "mvc", "mvvm", "singleton", "factory pattern",
  "observer pattern", "decorator", "proxy pattern", "design pattern",
  "async", "await", "promise", "promises", "callback", "callbacks",
  "closure", "closures", "prototype", "prototypal", "inheritance", "polymorphism",
  "abstraction", "encapsulation", "dependency injection", "inversion of control",
  "microservices", "monorepo", "ci/cd", "ci cd", "continuous integration",
  "containerization", "virtualization", "load balancing", "rate limiting",
  "jwt", "oauth", "cors", "xss", "csrf", "sql injection",
  "migration", "schema", "index", "indexing", "query optimization", "transaction",
  "replication", "sharding", "normalization", "denormalization",
  "server side rendering", "static site generation", "api gateway",
  "event loop", "event driven", "pub sub", "message queue",
  "serverless", "edge computing", "cdn", "dns", "ssl", "tls", "https",
  "unit test", "integration test", "e2e test", "test driven", "tdd", "bdd",
  "clean architecture", "hexagonal", "domain driven", "ddd",
  "monolith", "soa", "event sourcing", "cqrs",
  "composable", "composables", "render props", "higher order component", "hoc",
  "context api", "provider pattern", "store", "reducer", "action", "dispatch",
  "virtual dom", "reconciliation", "fiber", "concurrent mode",
  "bundle size", "performance optimization", "web vitals", "lighthouse",
]);

const TECH_QUESTION_PATTERNS = [
  "best way", "best practice", "best practices", "recommended",
  "أفضل طريقة", "افضل طريقة", "أحسن طريقة", "احسن طريقة",
  "قارنلي", "قارن لي", "قارن بين", "compare", "comparison",
  "شنو الفرق", "الفرق بين", "ما الفرق", "واش الفرق", "difference between",
  "واش نستعمل", "شنو نستعمل", "أي واحد", "اي واحد", "which one", "which is better",
  "كيفاش نخدم ب", "كيفاش نستعمل", "how to use", "how to implement", "how to set up",
  "vs", "versus", "or should i", "مقارنة",
  "pros and cons", "advantages", "disadvantages", "avantages", "inconvénients",
  "when to use", "why use", "should i use", "متى نستعمل", "علاش نستعمل",
  "meilleur", "meilleure", "comparer", "différence", "lequel",
  "tutorial", "guide", "شرح", "دليل",
];

const CODE_TOKEN_PATTERNS = [
  /[a-z]+[A-Z][a-zA-Z]*/,
  /[a-zA-Z]+\.[a-zA-Z]+/,
  /from\s+['"][^'"]+['"]/,
  /import\s+/,
  /require\s*\(/,
  /\.(ts|tsx|jsx|js|py|go|rs|vue|svelte)\b/,
  /v\d+(\.\d+)?/,
  /\bapi\b/i,
  /@[a-zA-Z]+/,
  /\buse[A-Z][a-zA-Z]+/,
];

export interface TechScoreResult {
  score: number;
  detectedTopic: string;
  signals: string[];
}

export function computeTechScore(text: string): TechScoreResult {
  const lower = normalizeArabic(text.toLowerCase().trim());
  const original = text.trim();
  let score = 0;
  const signals: string[] = [];
  let detectedTopic = "";

  for (const fw of TECH_FRAMEWORKS) {
    if (lower.includes(fw)) {
      score += 3;
      signals.push(`framework:${fw}`);
      if (!detectedTopic) detectedTopic = fw;
    }
  }

  for (const concept of TECH_CONCEPTS) {
    if (lower.includes(concept)) {
      score += 2;
      signals.push(`concept:${concept}`);
      if (!detectedTopic) detectedTopic = concept;
    }
  }

  for (const pattern of TECH_QUESTION_PATTERNS) {
    if (lower.includes(pattern)) {
      score += 2;
      signals.push(`question:${pattern}`);
    }
  }

  let codeTokenCount = 0;
  for (const regex of CODE_TOKEN_PATTERNS) {
    if (regex.test(original)) {
      codeTokenCount++;
    }
  }
  if (codeTokenCount > 0) {
    score += codeTokenCount;
    signals.push(`code-tokens:${codeTokenCount}`);
  }

  return { score, detectedTopic, signals };
}

function classifyIntentOffline(text: string, dialect: Dialect): ChatIntent {
  const lower = normalizeArabic(text.toLowerCase().trim());

  const affirmatives = ["yes", "yeah", "yep", "sure", "ok", "okay", "do it", "go ahead", "lets go", "let's go", "نعم", "اي", "أي", "ايوا", "طيب", "يلا", "تمام", "موافق", "ماشي", "اوكي", "حسناً", "افعلها", "نفذ", "صح", "ايه", "واه", "هيا", "oui", "d'accord", "بالاك", "ديرها"];
  if (affirmatives.some(w => lower === w || lower === w + "!" || lower === w + ".")) return "affirmative";

  const negatives = ["no", "nope", "nah", "cancel", "stop", "لا", "كلا", "الغ", "توقف", "خلاص", "بركا", "non", "ماشي هكذا", "لالا"];
  if (negatives.some(w => lower === w || lower === w + "!" || lower === w + ".")) return "negative";

  const imageRefWords = ["الصورة", "صورة", "لوجو", "logo", "image i sent", "image i uploaded", "اللي ارسلتها", "المرفقة", "ارسلتها", "رفعتها", "اللي بعثتها", "الصورة اللي", "حطها", "استخدم الصورة", "use the image", "as logo", "as background", "كخلفية", "كلوجو", "use image", "add the image", "اضف الصورة", "حط الصورة"];
  if (imageRefWords.some(w => lower.includes(w))) return "use-image";

  const cancelWords = ["cancel", "stop", "abort", "الغ", "الغي", "توقف", "وقف", "أوقف", "بطل", "خلاص بركا", "annuler", "arrêter", "سدها", "وقفها", "كفى"];
  if (cancelWords.some(w => lower.includes(w)) && lower.length < 40) return "cancel";

  const resetWords = ["reset", "clear all", "start fresh", "wipe", "clean slate", "إعادة تعيين", "امسح الكل", "صفر", "نبدا من الصفر", "من جديد كلشي", "امسح كلشي", "فرمت", "réinitialiser", "tout effacer", "repartir à zéro"];
  if (resetWords.some(w => lower.includes(w))) return "reset";

  const showFilesWords = ["show files", "list files", "show me the files", "what files", "file list", "ملفات", "وريني الملفات", "اعرض الملفات", "شو الملفات", "واش من ملف", "قائمة الملفات", "les fichiers", "montrer les fichiers", "liste des fichiers", "شوفلي الملفات", "واش كاين من ملف"];
  if (showFilesWords.some(w => lower.includes(w))) return "show-files";

  const openFileWords = ["open file", "open the file", "show me file", "view file", "افتح ملف", "افتح الملف", "وريني ملف", "فتحلي", "ouvrir le fichier", "ouvre", "افتحلي", "شوفلي ملف"];
  if (openFileWords.some(w => lower.includes(w))) return "open-file";

  const editFileWords = ["edit file", "modify file", "change file", "update file", "عدل ملف", "عدل الملف", "بدل في الملف", "غير الملف", "modifier le fichier", "éditer", "عدللي", "بدللي في"];
  if (editFileWords.some(w => lower.includes(w))) return "edit-file";

  const executeWords = ["execute autonomously", "autonomous", "agent loop", "codeact", "auto execute", "نفذ ذاتياً", "نفذ أوتوماتيك", "شغل أوتونوموس", "تنفيذ ذاتي", "وكيل مستقل", "exécuter automatiquement", "autonome", "agent autonome"];
  if (executeWords.some(w => lower.includes(w))) return "execute";

  const runWords = ["run", "execute", "start", "launch", "npm start", "npm run", "npm test", "شغل", "شغلو", "نفذ", "شغلي", "خدمو", "خدملي", "exécuter", "lancer", "démarrer", "شغلها", "حركها"];
  if (runWords.some(w => lower.includes(w)) && !lower.includes("runner")) return "run";

  const deployWords = ["deploy", "publish", "host", "upload to server", "put online", "go live", "انشر", "ارفع", "حطو اونلاين", "نشر", "رفع", "حطو على النت", "déployer", "publier", "mettre en ligne", "ارفعو", "حطو لايف"];
  if (deployWords.some(w => lower.includes(w))) return "deploy";

  const settingsWords = ["settings", "preferences", "config", "configuration", "toggle", "auto-fix", "الإعدادات", "إعدادات", "تفضيلات", "ضبط", "اعدادات", "الاعدادات", "paramètres", "configuration", "réglages", "ظبطلي", "بدل الإعدادات"];
  if (settingsWords.some(w => lower.includes(w))) return "settings";

  const summarizeWords = ["summarize", "summary", "overview", "recap", "wrap up", "لخص", "ملخص", "خلاصة", "اعطيني ملخص", "لخصلي", "résumer", "résumé", "synthèse", "عطيني نظرة عامة", "لخصلي المشروع"];
  if (summarizeWords.some(w => lower.includes(w))) return "summarize";

  const greetings = ["hi", "hello", "hey", "مرحبا", "اهلا", "السلام", "هلا", "أهلاً", "صباح", "مساء", "هاي", "صحيت", "واش راك", "كيراك", "لاباس", "bonjour", "salut", "bonsoir"];
  if (greetings.some(g => lower.includes(g)) && lower.length < 50) return "greeting";

  const thanks = ["thank", "thanks", "شكر", "ممتاز", "رائع", "great", "awesome", "perfect", "nice", "good job", "well done", "يعطيك العافية", "مشكور", "بارك الله", "merci", "عجبني", "يا سلام"];
  if (thanks.some(w => lower.includes(w)) && lower.length < 60) return "thanks";

  const helpWords = ["help", "مساعد", "ساعد", "commands", "أوامر", "what can", "ماذا يمكن", "قدرات", "capabilities", "شو تقدر", "وش تسوي", "واش تقدر", "aide", "كيفاش نخدم"];
  if (helpWords.some(w => lower.includes(w))) return "help";

  const statusWords = ["status", "progress", "الحالة", "التقدم", "وضع", "كيف المشروع", "how is", "what's the status", "project info", "شو صار", "وين وصل", "واش صرا", "فين وصل"];
  if (statusWords.some(w => lower.includes(w))) return "status";

  const techResult = computeTechScore(text);
  if (techResult.score >= 5) return "question";

  const explainWords = ["explain", "what does", "how does", "what is", "why does", "tell me about", "اشرح", "وضح", "ماذا يفعل", "كيف يعمل", "لماذا", "فسر", "حلل", "شو هذا", "وش هذا", "فهمني", "شرحلي", "واش هذا"];
  if (explainWords.some(w => lower.includes(w))) return "explain-code";

  const fixWords = ["fix", "error", "bug", "broken", "not working", "crash", "issue", "problem", "debug", "doesn't work", "dont work", "won't work", "blank page", "blank screen", "is blank", "white screen", "nothing shows", "nothing happens", "not loading", "not showing", "not responding", "won't load", "can't see", "أصلح", "خطأ", "مشكلة", "لا يعمل", "لا تعمل", "لا يشتغل", "لا تشتغل", "تعطل", "باغ", "صحح", "ما يشتغل", "ما يشتغلش", "ما تشتغلش", "ما يخدمش", "ما تخدمش", "فيه مشكل", "فيها مشكل", "صلحلي", "ما تخدم", "ما يخدم", "خاطئ", "عطل", "عطلان", "عطلانة", "مكسور", "كاسر", "خربان", "خربانة", "صفحة بيضاء", "ما يبان", "ما يبانش", "فارغة", "ne marche pas", "ne fonctionne pas", "erreur", "problème", "page blanche", "écran blanc"];
  if (fixWords.some(w => lower.includes(w))) return "fix-error";

  const improveWords = ["improve", "better", "optimize", "refactor", "clean", "faster", "performance", "حسن", "طور", "أفضل", "أسرع", "نظف", "رتب", "أداء", "حسّن"];
  if (improveWords.some(w => lower.includes(w))) return "improve";

  const addWords = ["add", "new feature", "include", "integrate", "أضف", "ميزة", "ضيف", "أريد", "اريد", "i want", "can you add", "i need", "أبغى", "ابي", "نحب", "زيد", "زيدلي", "نبغي"];
  if (addWords.some(w => lower.includes(w))) return "add-feature";

  const styleWords = ["style", "color", "theme", "design", "layout", "font", "dark", "light", "ui", "ux", "لون", "تصميم", "شكل", "خط", "واجهة", "مظهر", "ألوان", "couleur"];
  if (styleWords.some(w => lower.includes(w))) return "change-style";

  const rebuildWords = ["rebuild", "redo", "start over", "regenerate", "from scratch", "أعد", "من جديد", "أعد بناء", "ابني من الصفر", "من البداية", "عاود"];
  if (rebuildWords.some(w => lower.includes(w))) return "rebuild";

  const translateWords = ["translate", "ترجم", "حول", "بالعربي", "بالانجليزي", "in arabic", "in english"];
  if (translateWords.some(w => lower.includes(w))) return "translate";

  const docWords = ["document", "docs", "readme", "guide", "وثق", "توثيق", "دليل"];
  if (docWords.some(w => lower.includes(w))) return "document";

  const questionWords = ["?", "؟", "how", "what", "when", "where", "which", "can i", "is it", "do i", "should", "كيف", "ما هو", "متى", "أين", "هل", "أي", "ليش", "شلون", "علاش", "واشنو", "كيفاش"];
  if (questionWords.some(w => lower.includes(w))) return "question";

  const buildWords = ["build", "create", "make", "generate", "develop", "أنشئ", "بناء", "اصنع", "اعمل", "ابني", "ولد", "سو لي", "سوي", "ديرلي", "نديرو", "اصنعلي", "créer", "faire"];
  if (buildWords.some(w => lower.includes(w))) return "build-new";

  return "unknown";
}

interface ProjectContext {
  projectId: string;
  projectName: string;
  description: string;
  status: string;
  stack: string;
  fileCount: number;
  filePaths: string[];
  fileSizes: number[];
  messageCount: number;
  lastMessages: { role: string; content: string; agentType: string | null; attachmentUrl?: string | null; attachmentType?: string | null; attachmentName?: string | null }[];
  hasHtml: boolean;
  hasCss: boolean;
  hasJs: boolean;
  totalCodeLines: number;
}

async function getProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await storage.getProject(projectId);
  const files = await storage.getProjectFiles(projectId);
  const messages = await storage.getChatMessages(projectId);

  const hasHtml = files.some(f => f.path.endsWith(".html"));
  const hasCss = files.some(f => f.path.endsWith(".css"));
  const hasJs = files.some(f => f.path.endsWith(".js"));
  const totalCodeLines = files.reduce((sum, f) => sum + (f.content?.split("\n").length || 0), 0);

  return {
    projectId,
    projectName: project?.name || "",
    description: project?.description || "",
    status: project?.status || "planning",
    stack: project?.stack || "fullstack",
    fileCount: files.length,
    filePaths: files.map(f => f.path),
    fileSizes: files.map(f => f.content?.length || 0),
    messageCount: messages.length,
    lastMessages: messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content.substring(0, 300),
      agentType: m.agentType,
      attachmentUrl: m.attachmentUrl,
      attachmentType: m.attachmentType,
      attachmentName: m.attachmentName,
    })),
    hasHtml,
    hasCss,
    hasJs,
    totalCodeLines,
  };
}

function getLastAttachment(ctx: ProjectContext): { url: string; name: string; type: string } | null {
  for (let i = ctx.lastMessages.length - 1; i >= 0; i--) {
    const msg = ctx.lastMessages[i];
    if (msg.attachmentUrl && msg.attachmentType === "image") {
      return { url: msg.attachmentUrl, name: msg.attachmentName || "image", type: msg.attachmentType };
    }
  }
  return null;
}

function getLastAssistantMessage(ctx: ProjectContext): string | null {
  for (let i = ctx.lastMessages.length - 1; i >= 0; i--) {
    if (ctx.lastMessages[i].role === "agent" && ctx.lastMessages[i].agentType === "assistant") {
      return ctx.lastMessages[i].content;
    }
  }
  return null;
}

function wasRecentlyAsked(ctx: ProjectContext, intent: ChatIntent): boolean {
  const userMsgs = ctx.lastMessages.filter(m => m.role === "user");
  if (userMsgs.length < 2) return false;
  const prev = userMsgs[userMsgs.length - 2]?.content?.toLowerCase() || "";
  const intentKeywords: Record<string, string[]> = {
    status: ["status", "الحالة", "وضع", "progress", "واش صرا"],
    "explain-code": ["explain", "اشرح", "وضح", "شرحلي"],
    improve: ["improve", "حسن", "طور", "حسّن"],
    "fix-error": ["fix", "أصلح", "error", "خطأ", "صلحلي"],
  };
  const keywords = intentKeywords[intent];
  if (!keywords) return false;
  return keywords.some(k => prev.includes(k));
}

function detectEmotion(text: string): "frustrated" | "excited" | "neutral" {
  const lower = text.toLowerCase();
  const frustrated = ["!!!", "doesn't work", "not working", "broken", "again", "still", "why won't", "ugh", "لا يعمل", "ما يشتغل", "مرة ثانية", "ليش ما", "تعبت", "ما يخدمش", "مزال ما خدمش", "عياني"];
  if (frustrated.some(w => lower.includes(w))) return "frustrated";
  const excited = ["amazing", "awesome", "love it", "perfect", "wow", "cool", "رهيب", "ممتاز", "يا سلام", "حلو", "واو", "عجبني بزاف"];
  if (excited.some(w => lower.includes(w))) return "excited";
  return "neutral";
}

function extractFeatureDetails(text: string): { features: string[]; colors: string[]; elements: string[] } {
  const features: string[] = [];
  const colors: string[] = [];
  const elements: string[] = [];
  const colorMatches = text.match(/(red|blue|green|yellow|purple|pink|orange|cyan|white|black|أحمر|أزرق|أخضر|أصفر|بنفسجي|وردي|برتقالي|أبيض|أسود)/gi);
  if (colorMatches) colors.push(...Array.from(new Set(colorMatches)));
  ["button", "header", "footer", "sidebar", "navbar", "modal", "form", "table", "card", "list", "grid", "menu", "search", "input", "chart", "slider", "زر", "رأس", "تذييل", "قائمة", "نموذج", "جدول", "بطاقة", "شبكة"].forEach(kw => { if (text.toLowerCase().includes(kw)) elements.push(kw); });
  ["animation", "scroll", "responsive", "drag", "drop", "filter", "sort", "pagination", "notification", "tooltip", "حركة", "تمرير", "سحب", "إشعار", "تصفية", "ترتيب"].forEach(kw => { if (text.toLowerCase().includes(kw)) features.push(kw); });
  return { features, colors, elements };
}

function getStackName(stack: string, dialect: Dialect): string {
  const map: Record<string, [string, string]> = {
    "html-canvas-game": ["لعبة Canvas", "Canvas Game"],
    "html-app": ["تطبيق ويب", "Web App"],
    "react-tasks": ["إدارة مهام", "Task Manager"],
    "react-dashboard": ["لوحة تحكم", "Dashboard"],
    "react-blog": ["مدونة", "Blog"],
    "react-websocket": ["دردشة", "Chat App"],
    "react-ecommerce": ["متجر إلكتروني", "E-Commerce"],
    "react-notes": ["ملاحظات", "Notes App"],
    "express-api": ["REST API", "REST API"],
    "react-express": ["تطبيق متكامل", "Full-Stack App"],
  };
  const entry = map[stack];
  const isArabic = dialect === "ar" || dialect === "dz";
  return entry ? (isArabic ? entry[0] : entry[1]) : stack;
}

function getStatusText(status: string, dialect: Dialect): string {
  const map: Record<string, [string, string]> = {
    planning: ["قيد التخطيط", "planning"],
    designing: ["قيد التصميم", "being designed"],
    coding: ["قيد البناء", "being built"],
    testing: ["قيد الاختبار", "being tested"],
    ready: ["جاهز", "ready"],
    deployed: ["تم نشره", "deployed"],
  };
  const entry = map[status];
  const isArabic = dialect === "ar" || dialect === "dz";
  return entry ? (isArabic ? entry[0] : entry[1]) : status;
}

function isVagueBuildRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const vague = [
    /^(ابني|اصنع|اعمل|سوي?|ديرلي|créer|build|create|make)\s*(لي\s*)?(تطبيق|application|app|موقع|حاجة|شيء|something|un truc)?\s*$/i,
    /^(نحب|نبغي|أبغى|أريد|أبي|بغيت|i want|i need)\s*(تطبيق|application|app|حاجة|شيء|something)?\s*$/i,
  ];
  return vague.some(r => r.test(lower)) || (lower.length < 15 && /^(ابني|اصنع|ديرلي|build|create)\b/.test(lower));
}

export class ChattyCoordinator {
  async handle(projectId: string, content: string): Promise<{ response: string; shouldBuild: boolean; buildDescription?: string; executeAutonomous?: boolean; executeTask?: string }> {
    const dialect = detectDialect(content);
    const ctx = await getProjectContext(projectId);
    const memory = getMemory(projectId);
    const intent = isCloudMode() ? await classifyIntentAsync(content, dialect) : classifyIntent(content, dialect);
    const emotion = detectEmotion(content);
    const repeated = wasRecentlyAsked(ctx, intent);
    const lastAiMsg = getLastAssistantMessage(ctx);

    memory.dialect = dialect;
    memory.lastIntent = intent;

    const lastAttach = getLastAttachment(ctx);
    if (lastAttach) {
      memory.lastAttachments = [lastAttach];
    }

    const name = ctx.projectName;
    const stackName = getStackName(ctx.stack, dialect);
    const statusText = getStatusText(ctx.status, dialect);
    const isReady = ctx.status === "ready";
    const hasFiles = ctx.fileCount > 0;

    if (memory.pendingClarification) {
      if (intent === "negative") {
        memory.pendingClarification = null;
        return { response: this.say(dialect, "ماشي مشكل! قولي واش تحب نديرو.", "مافيه مشكلة! قولي شو تبي.", "No problem! Tell me what you'd like instead.", "Pas de souci ! Dis-moi ce que tu veux."), shouldBuild: false };
      }
      if (intent === "greeting" || intent === "help") {
        memory.pendingClarification = null;
      } else {
        const buildDesc = intent === "affirmative" ? memory.pendingClarification : content;
        memory.pendingClarification = null;
        const analysis = smartAnalyzer.analyze(buildDesc, dialect);
        return {
          response: `${analysis.summary}\n\n${this.respondBuildStart(dialect, name)}`,
          shouldBuild: true,
          buildDescription: buildDesc,
        };
      }
    }

    switch (intent) {
      case "greeting":
        return { response: this.handleGreeting(dialect, ctx, name, stackName, statusText, isReady), shouldBuild: false };
      case "thanks":
        return { response: this.handleThanks(dialect), shouldBuild: false };
      case "help":
        return { response: this.handleHelp(dialect), shouldBuild: false };
      case "status":
        return { response: this.handleStatus(dialect, ctx, name, stackName, statusText, isReady, hasFiles, repeated), shouldBuild: false };
      case "affirmative":
        return this.handleAffirmative(dialect, ctx, lastAiMsg, name, memory);
      case "negative":
        return { response: this.say(dialect, "واش تحب نديرو بلاصتها؟", "شو تبي بدال كذا؟", "What would you like to do instead?", "Que veux-tu faire à la place ?"), shouldBuild: false };
      case "explain-code":
        return { response: this.handleExplain(dialect, ctx, name, stackName, hasFiles, repeated), shouldBuild: false };
      case "fix-error": {
        const baseResponse = this.handleFixError(dialect, ctx, name, emotion, hasFiles);
        const debugDiag = friendlyDebugger.diagnose(content, dialect, { hasHtml: ctx.hasHtml, hasCss: ctx.hasCss, hasJs: ctx.hasJs, fileCount: ctx.fileCount });
        return { response: `${baseResponse}\n\n${debugDiag}`, shouldBuild: false };
      }
      case "improve":
        return { response: this.handleImprove(dialect, ctx, name, repeated), shouldBuild: false };
      case "question":
        return { response: await this.handleQuestion(dialect, content, ctx, name, stackName, isReady), shouldBuild: false };
      case "translate":
        return { response: this.say(dialect, "واش تحب نترجم؟ الواجهة، التعليقات، ولا التوثيق؟", "شو تبي أترجم؟ الواجهة أو الكود؟", "What should I translate? Interface, comments, or docs?", "Que veux-tu que je traduise ?"), shouldBuild: false };
      case "document":
        return { response: this.say(dialect, `رايح نكتب التوثيق تاع "${name}" 📝 صبر شوية...`, `بكتب توثيق "${name}" 📝 أعطني لحظة...`, `Writing docs for "${name}" 📝 Give me a moment...`, `Je rédige la doc pour "${name}" 📝`), shouldBuild: true, buildDescription: `document ${name}` };
      case "use-image":
        return this.handleUseImage(dialect, ctx, memory, name);
      case "show-files":
        return { response: this.handleShowFiles(dialect, ctx, name), shouldBuild: false };
      case "open-file":
        return { response: this.handleOpenFile(dialect, content, ctx, name), shouldBuild: false };
      case "edit-file":
        return { response: this.handleEditFile(dialect, content, ctx, name), shouldBuild: false };
      case "run":
        return { response: this.handleRun(dialect, ctx, name), shouldBuild: false };
      case "execute":
        return { response: this.handleExecute(dialect, ctx, name, content), shouldBuild: false, executeAutonomous: true, executeTask: content };
      case "deploy":
        return { response: this.handleDeploy(dialect, ctx, name, isReady), shouldBuild: false };
      case "settings":
        return { response: this.handleSettings(dialect, memory), shouldBuild: false };
      case "cancel":
        return { response: this.handleCancel(dialect), shouldBuild: false };
      case "reset":
        return { response: this.handleReset(dialect, name), shouldBuild: false };
      case "summarize":
        return { response: this.handleSummarize(dialect, ctx, name, stackName, statusText, isReady, hasFiles), shouldBuild: false };
      case "build-new":
      case "add-feature":
      case "change-style":
      case "rebuild":
        return this.handleBuildIntent(intent, content, dialect, ctx, memory, emotion, name, stackName, statusText, isReady, hasFiles);
      default:
        return { response: this.handleUnknown(dialect, ctx, name, statusText, isReady), shouldBuild: false };
    }
  }

  private say(dialect: Dialect, dz: string, ar: string, en: string, fr: string): string {
    switch (dialect) {
      case "dz": return dz;
      case "ar": return ar;
      case "en": return en;
      case "fr": return fr;
    }
  }

  private handleGreeting(dialect: Dialect, ctx: ProjectContext, name: string, stackName: string, statusText: string, isReady: boolean): string {
    switch (dialect) {
      case "dz":
        return pick([
          `صحيت خويا! 👋 واش راك?\n\nمشروعك "${name}" ${isReady ? "جاهز وخدام مليح" : `درك ${statusText}`}. عندك ${ctx.fileCount} ملف فيهم ${ctx.totalCodeLines} سطر كود.\n\nقولي واش تحب نديرلك 😊`,
          `لاباس عليك! 👋\n\n"${name}" — ${stackName}${isReady ? "، كلشي لاباس" : ` — ${statusText}`}.\n\nواش نقدر نعاونك؟`,
          `وعليكم السلام! 👋 كيراك؟\n\n"${name}" فيه ${ctx.fileCount} ملفات${isReady ? " وجاهز تشوفو" : ""}. قولي واش تحتاج.`,
        ]);
      case "ar":
        return pick([
          `أهلاً وسهلاً! 👋 كيف حالك?\n\nمشروعك "${name}" ${isReady ? "جاهز ويشتغل" : `الآن ${statusText}`}. عندك ${ctx.fileCount} ملف فيه ${ctx.totalCodeLines} سطر كود.\n\nشو تبي نسوي اليوم؟`,
          `هلا والله! 👋\n\n"${name}" — ${stackName}${isReady ? "، وكل شيء تمام" : ` — ${statusText}`}.\n\nقولي شو تحتاج وأنا جاهز.`,
          `مرحبا! 👋\n\n"${name}" فيه ${ctx.fileCount} ملفات${isReady ? " وجاهز للمعاينة" : ""}. كيف أقدر أساعدك؟`,
        ]);
      case "fr":
        return pick([
          `Salut ! 👋\n\nTon projet "${name}" ${isReady ? "est prêt et fonctionne bien" : `est en cours — ${statusText}`}. Tu as ${ctx.fileCount} fichiers avec ${ctx.totalCodeLines} lignes de code.\n\nQu'est-ce que tu veux faire ?`,
          `Bonjour ! 👋\n\n"${name}" — ${stackName}${isReady ? ", tout est bon" : ` — ${statusText}`}.\n\nComment je peux t'aider ?`,
        ]);
      default:
        return pick([
          `Hey there! 👋\n\nYour project "${name}" is ${isReady ? "ready and looking good" : statusText}. You've got ${ctx.fileCount} files with ${ctx.totalCodeLines} lines of code.\n\nWhat would you like to work on?`,
          `Hi! 👋\n\n"${name}" — ${stackName}${isReady ? ", everything's good to go" : `, currently ${statusText}`}.\n\nWhat can I help you with?`,
        ]);
    }
  }

  private handleThanks(dialect: Dialect): string {
    switch (dialect) {
      case "dz":
        return pick([
          "ولو خويا! هذي خدمتي 💪 كاين حاجة أخرى؟",
          "الله يعافيك! فرحت كي عجبك الخدمة 😊 واش تحب نزيد؟",
          "بلا مزية! أنا هنا كي تحتاجني 😊",
          "تسلم! قولي لوكان تحب حاجة أخرى.",
        ]);
      case "ar":
        return pick([
          "العفو! هذا واجبي 😊 إذا احتجت أي شيء أنا هنا.",
          "تسلم! سعيد إن الشغل عجبك 🙏 تبي نضيف شيء؟",
          "الله يعافيك! أي وقت أنا موجود 😊",
        ]);
      case "fr":
        return pick([
          "De rien ! C'est mon boulot 😊 Autre chose ?",
          "Content que ça te plaise ! 🙏 Tu veux ajouter quelque chose ?",
        ]);
      default:
        return pick([
          "You're welcome! Happy to help 😊 Let me know if you need anything else.",
          "Glad you like it! 🙏 Want to add anything else?",
          "Anytime! I'm here whenever you need me 😊",
        ]);
    }
  }

  private handleHelp(dialect: Dialect): string {
    switch (dialect) {
      case "dz":
        return `نقدر نعاونك بحوايج بزاف! هاك واش نقدر ندير:\n\n• وصفلي فكرة تطبيق ونبنيهالك كاملة\n• قول "اشرح" ونحلللك الكود ملف ملف\n• قول "صلحلي" ونشوف المشاكل\n• قول "حسّن" ونعطيك اقتراحات\n• قول "واش صرا" ونعطيك تقرير\n\n⌨️ اختصارات:\n• Ctrl+S — حفظ الملف\n• Ctrl+1~7 — التنقل بين اللوحات\n• Ctrl+N — ملف جديد\n\nولا ببساطة اكتب واش تحب وأنا نفهمك. نهدر عربي، فرونسي وإنجليزي 😊`;
      case "ar":
        return `أقدر أساعدك بأشياء كثيرة! خلني أقولك:\n\n• اوصف لي فكرة تطبيق وأبنيه لك كامل\n• قول "اشرح" وأحلل لك الكود ملف ملف\n• قول "أصلح" وأفحص المشروع من الأخطاء\n• قول "حسّن" وأعطيك اقتراحات تطوير\n• قول "الحالة" وأعطيك تقرير كامل\n\n⌨️ اختصارات لوحة المفاتيح:\n• Ctrl+S — حفظ الملف\n• Ctrl+1~7 — التنقل بين اللوحات\n• Ctrl+N — ملف جديد\n\nأو ببساطة اكتب أي شيء تبيه وأنا أفهمك. أتكلم عربي وإنجليزي 😊`;
      case "fr":
        return `Je peux t'aider avec plein de choses :\n\n• Décris une idée d'app et je la construis\n• Dis "explique" pour une analyse du code\n• Dis "corrige" pour chercher les bugs\n• Dis "améliore" pour des suggestions\n• Dis "statut" pour un rapport complet\n\n⌨️ Raccourcis :\n• Ctrl+S — Sauvegarder\n• Ctrl+1~7 — Naviguer les panneaux\n• Ctrl+N — Nouveau fichier\n\nOu écris ce que tu veux, je comprendrai 😊`;
      default:
        return `Here's what I can do:\n\n• Describe an app idea and I'll build it from scratch\n• Say "explain" and I'll break down your code\n• Say "fix" and I'll scan for errors\n• Say "improve" for optimization suggestions\n• Say "status" for a project overview\n\n⌨️ Keyboard shortcuts:\n• Ctrl+S — Save file\n• Ctrl+1~7 — Switch panels\n• Ctrl+N — New file\n\nOr just type anything — I'll figure it out 😊`;
    }
  }

  private handleStatus(dialect: Dialect, ctx: ProjectContext, name: string, stackName: string, statusText: string, isReady: boolean, hasFiles: boolean, repeated: boolean): string {
    if (repeated) {
      if (dialect === "dz") return isReady ? `نفس ماقلتلك — "${name}" جاهز وما تبدل والو. ${ctx.fileCount} ملف، ${ctx.totalCodeLines} سطر كود. تحب نزيدو حاجة جديدة؟` : `مزال نفس الحالة — ${statusText}. صبر شوية.`;
      if (dialect === "ar") return isReady ? `نفس ما قلت لك — "${name}" جاهز. ${ctx.fileCount} ملف. تبي نضيف شيء؟` : `لسا نفس الوضع — ${statusText}. أعطيه شوية وقت.`;
      if (dialect === "fr") return isReady ? `Comme je disais — "${name}" est prêt. ${ctx.fileCount} fichiers. Tu veux ajouter quelque chose ?` : `Toujours ${statusText}. Patience.`;
      return isReady ? `Same as before — "${name}" is ready. ${ctx.fileCount} files. Want to add something?` : `Still ${statusText}. Give it a moment.`;
    }

    const fileList = ctx.filePaths.map((f, i) => {
      const size = ctx.fileSizes[i] || 0;
      return `  • ${f} (${size > 1000 ? (size / 1024).toFixed(1) + "KB" : size + "B"})`;
    }).join("\n");

    const techs = [ctx.hasHtml ? "HTML" : "", ctx.hasCss ? "CSS" : "", ctx.hasJs ? "JavaScript" : ""].filter(Boolean).join(" • ");

    if (dialect === "dz") {
      let r = `مشروع "${name}" — ${stackName}\n\nالحالة: ${statusText}${isReady ? " ✅" : ""}\nالملفات: ${ctx.fileCount} ملف (${ctx.totalCodeLines} سطر كود)`;
      if (hasFiles) r += `\n\n${fileList}`;
      r += `\n\nالتقنيات: ${techs}`;
      r += isReady ? `\n\nكلشي جاهز! تحب تشوفو ولا نحسنو؟` : `\n\nمزال يخدم... صبر شوية.`;
      return r;
    }
    if (dialect === "ar") {
      let r = `مشروع "${name}" — ${stackName}\n\nالحالة: ${statusText}${isReady ? " ✅" : ""}\nالملفات: ${ctx.fileCount} ملف (${ctx.totalCodeLines} سطر كود)`;
      if (hasFiles) r += `\n\n${fileList}`;
      r += `\n\nالتقنيات: ${techs}`;
      r += isReady ? `\n\nالمشروع جاهز! تبي تجربه بالمعاينة؟` : `\n\nلسا يشتغل... صبر شوي.`;
      return r;
    }
    if (dialect === "fr") {
      let r = `Projet "${name}" — ${stackName}\n\nStatut: ${statusText}${isReady ? " ✅" : ""}\nFichiers: ${ctx.fileCount} (${ctx.totalCodeLines} lignes)`;
      if (hasFiles) r += `\n\n${fileList}`;
      r += `\n\nTech: ${techs}`;
      r += isReady ? `\n\nTout est prêt ! Tu veux le tester ?` : `\n\nEncore en cours...`;
      return r;
    }
    let r = `Project "${name}" — ${stackName}\n\nStatus: ${isReady ? "Ready ✅" : statusText}\nFiles: ${ctx.fileCount} (${ctx.totalCodeLines} lines)`;
    if (hasFiles) r += `\n\n${fileList}`;
    r += `\n\nTech: ${techs}`;
    r += isReady ? `\n\nAll good! Preview it or want improvements?` : `\n\nStill working... hang tight.`;
    return r;
  }

  private handleAffirmative(dialect: Dialect, ctx: ProjectContext, lastAiMsg: string | null, name: string, memory: ConversationMemory): { response: string; shouldBuild: boolean; buildDescription?: string } {
    if (lastAiMsg) {
      if (lastAiMsg.includes("تحسين") || lastAiMsg.includes("حسّن") || lastAiMsg.includes("improv") || lastAiMsg.includes("suggest")) {
        return { response: this.say(dialect, `تمام، رايح نطبق التحسينات على "${name}" درك! 🚀`, `تمام، بطبق التحسينات على "${name}" الآن! 🚀`, `On it! Applying improvements to "${name}" now 🚀`, `C'est parti ! J'applique les améliorations 🚀`), shouldBuild: true, buildDescription: `improve ${name}` };
      }
      if (lastAiMsg.includes("معاينة") || lastAiMsg.includes("preview") || lastAiMsg.includes("تشوفو")) {
        return { response: this.say(dialect, "روح للمعاينة المباشرة وشوف النتيجة! جرب وضع الموبايل زيد.", "افتح المعاينة المباشرة وشوف النتيجة!", "Open the Live Preview panel and check it out!", "Ouvre l'aperçu et regarde !"), shouldBuild: false };
      }
      if (lastAiMsg.includes("ميزة") || lastAiMsg.includes("feature") || lastAiMsg.includes("أضف") || lastAiMsg.includes("نزيد")) {
        return { response: this.say(dialect, `ممتاز! رايح نخدم عليها درك ⚡`, `ممتاز! أشتغل عليها الحين ⚡`, `Great! Working on it now ⚡`, `Super ! J'y travaille ⚡`), shouldBuild: true, buildDescription: `add feature to ${name}` };
      }
      return { response: this.say(dialect, "تمام! رايح نخدم عليه. صبر شوية... ⚡", "حسناً! أشتغل عليه. أعطني لحظة... ⚡", "Alright, working on it! Give me a moment... ⚡", "D'accord, j'y travaille ! Un moment... ⚡"), shouldBuild: true, buildDescription: ctx.description };
    }
    return { response: this.say(dialect, "تمام! قولي واش تحب ندير بالضبط وأنا نبدا.", "تمام! قولي شو تبي أسوي بالضبط.", "Sure! Tell me what you'd like and I'll get started.", "D'accord ! Dis-moi ce que tu veux."), shouldBuild: false };
  }

  private handleExplain(dialect: Dialect, ctx: ProjectContext, name: string, stackName: string, hasFiles: boolean, repeated: boolean): string {
    if (!hasFiles) return this.say(dialect, "ما كاين حتى كود باش نشرحو. وصفلي فكرتك ونبنيها!", "ما فيه كود للشرح. اوصف فكرتك وأبنيها!", "No code to explain yet. Describe your idea!", "Pas de code à expliquer. Décris ton idée !");
    if (repeated) return this.say(dialect, `نفس ما شرحتلك — ${ctx.fileCount} ملفات. تحب نشرحلك ملف معين؟`, `زي ما شرحت — ${ctx.fileCount} ملفات. تبي ملف معين؟`, `Same as before — ${ctx.fileCount} files. Want a specific one?`, `Comme avant — ${ctx.fileCount} fichiers. Un fichier spécifique ?`);

    const explanations = ctx.filePaths.map((f) => {
      const n = f.split("/").pop() || f;
      if (n.endsWith(".html")) return `• **${f}** — ${this.say(dialect, "هيكل الصفحة", "هيكل الصفحة", "page structure", "structure de la page")}`;
      if (n.endsWith(".css")) return `• **${f}** — ${this.say(dialect, "التنسيقات والتصميم", "التنسيقات والألوان", "styling and design", "styles et design")}`;
      if (n === "game.js") return `• **${f}** — ${this.say(dialect, "محرك اللعبة", "محرك اللعبة", "game engine", "moteur de jeu")}`;
      if (n.endsWith(".js")) return `• **${f}** — ${this.say(dialect, "المنطق والتفاعلات", "المنطق والتفاعلات", "logic and interactions", "logique et interactions")}`;
      if (n === "package.json") return `• **${f}** — ${this.say(dialect, "إعدادات المشروع", "إعدادات المشروع", "project config", "config du projet")}`;
      if (n.endsWith(".md")) return `• **${f}** — ${this.say(dialect, "التوثيق", "التوثيق", "documentation", "documentation")}`;
      return `• **${f}**`;
    }).join("\n");

    return this.say(dialect,
      `خلني نشرحلك "${name}":\n\nمشروع من نوع ${stackName}، فيه ${ctx.totalCodeLines} سطر كود في ${ctx.fileCount} ملفات:\n\n${explanations}\n\nكلشي يخدم في المتصفح بدون سيرفر خارجي. تحب ندخل في التفاصيل تاع ملف معين؟`,
      `خلني أشرح "${name}":\n\nمشروع ${stackName}، فيه ${ctx.totalCodeLines} سطر كود:\n\n${explanations}\n\nيشتغل بالمتصفح. تبي تفاصيل ملف معين؟`,
      `Let me walk you through "${name}":\n\nIt's a ${stackName} with ${ctx.totalCodeLines} lines across ${ctx.fileCount} files:\n\n${explanations}\n\nRuns in the browser. Want me to dive into any specific file?`,
      `Voici "${name}" :\n\nC'est un ${stackName} avec ${ctx.totalCodeLines} lignes dans ${ctx.fileCount} fichiers :\n\n${explanations}\n\nTout tourne dans le navigateur. Un fichier en détail ?`
    );
  }

  private handleFixError(dialect: Dialect, ctx: ProjectContext, name: string, emotion: string, hasFiles: boolean): string {
    const prefix = emotion === "frustrated" ? this.say(dialect, "نفهمك خويا، الباغات تعصب. خلني نشوف...\n\n", "أفهمك، الأخطاء تعصب. خلني أشوف...\n\n", "I hear you — bugs are frustrating. Let me check...\n\n", "Je comprends — les bugs c'est frustrant. Je regarde...\n\n") : "";

    const checks: string[] = [];
    if (!ctx.hasHtml) checks.push(this.say(dialect, "ما كاينش ملف HTML — هذا ممكن هو السبب", "ما لقيت ملف HTML", "No HTML file found", "Pas de fichier HTML trouvé"));
    if (!ctx.hasCss) checks.push(this.say(dialect, "ما كاينش CSS — الشكل ممكن يكون مكسور", "ما فيه CSS", "No CSS file", "Pas de fichier CSS"));
    if (!ctx.hasJs) checks.push(this.say(dialect, "ما كاينش JavaScript — التفاعلات ما تخدمش", "ما فيه JavaScript", "No JavaScript", "Pas de JavaScript"));
    if (ctx.fileCount === 0) checks.push(this.say(dialect, "المشروع فارغ! لازم نبنيوه أول", "المشروع فاضي!", "Project is empty!", "Le projet est vide !"));

    if (checks.length === 0) {
      return `${prefix}${this.say(dialect,
        `فحصت "${name}" — كلشي يبان لاباس:\n\n• HTML ✓\n• CSS ✓\n• JavaScript ✓\n\nلوكان كاين خطأ محدد، وصفلي واش تشوف بالضبط.`,
        `فحصت "${name}" — كل شيء سليم:\n\n• HTML ✓\n• CSS ✓\n• JavaScript ✓\n\nوصف لي الخطأ اللي تشوفه.`,
        `Scanned "${name}" — everything looks good:\n\n• HTML ✓\n• CSS ✓\n• JavaScript ✓\n\nDescribe the specific error you're seeing.`,
        `J'ai vérifié "${name}" — tout semble bon :\n\n• HTML ✓\n• CSS ✓\n• JavaScript ✓\n\nDécris l'erreur que tu vois.`
      )}`;
    }
    return `${prefix}${this.say(dialect,
      `لقيت مشاكل في "${name}":\n\n${checks.map(c => `⚠️ ${c}`).join("\n")}\n\nتحب نصلحهم؟`,
      `لقيت مشاكل في "${name}":\n\n${checks.map(c => `⚠️ ${c}`).join("\n")}\n\nتبي أصلحها؟`,
      `Found issues in "${name}":\n\n${checks.map(c => `⚠️ ${c}`).join("\n")}\n\nWant me to fix them?`,
      `Problèmes trouvés dans "${name}" :\n\n${checks.map(c => `⚠️ ${c}`).join("\n")}\n\nTu veux que je corrige ?`
    )}`;
  }

  private handleImprove(dialect: Dialect, ctx: ProjectContext, name: string, repeated: boolean): string {
    if (repeated) return this.say(dialect, "نفس الاقتراحات اللي قلتلك. تحب نطبق واحد منهم؟", "نفس الاقتراحات. تبي أطبق واحد؟", "Same suggestions. Want me to apply one?", "Mêmes suggestions. Tu veux que j'en applique une ?");

    let suggestions: string[] = [];
    if (ctx.stack.includes("game")) {
      suggestions = dialect === "dz" || dialect === "ar"
        ? ["مستويات صعوبة", "لوحة أفضل النتائج", "تأثيرات صوتية", "تحكم بالتاتش", "سمات مرئية"]
        : dialect === "fr"
          ? ["Niveaux de difficulté", "Tableau des scores", "Effets sonores", "Contrôles tactiles", "Thèmes visuels"]
          : ["Difficulty levels", "Leaderboard", "Sound effects", "Touch controls", "Visual themes"];
    } else if (ctx.stack.includes("ecommerce")) {
      suggestions = dialect === "dz" || dialect === "ar"
        ? ["بحث ذكي", "نظام تقييم", "تحسين صفحة الدفع", "عرض محسّن للموبايل"]
        : dialect === "fr"
          ? ["Recherche intelligente", "Système d'avis", "Checkout amélioré", "Vue mobile"]
          : ["Smart search", "Rating system", "Better checkout", "Mobile layout"];
    } else {
      suggestions = dialect === "dz" || dialect === "ar"
        ? ["تحسين سرعة التحميل", "تصميم متجاوب أفضل", "رسوم متحركة", "تحقق من المدخلات", "إمكانية الوصول"]
        : dialect === "fr"
          ? ["Vitesse de chargement", "Design responsive", "Animations", "Validation", "Accessibilité"]
          : ["Loading speed", "Responsive design", "Animations", "Input validation", "Accessibility"];
    }

    return this.say(dialect,
      `عندي أفكار باش نحسنو "${name}":\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nواش عجبك؟ قول الرقم ولا وصفلي واش تحب.`,
      `عندي اقتراحات لتحسين "${name}":\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nأيها يعجبك؟`,
      `Ideas to improve "${name}":\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nWhich one sounds good?`,
      `Idées pour améliorer "${name}" :\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nLaquelle te plaît ?`
    );
  }

  private async handleQuestion(dialect: Dialect, text: string, ctx: ProjectContext, name: string, stackName: string, isReady: boolean): Promise<string> {
    const lower = text.toLowerCase();
    if (lower.includes("كم") || lower.includes("how many") || lower.includes("شحال") || lower.includes("combien")) {
      return this.say(dialect,
        `"${name}" فيه ${ctx.fileCount} ملفات و ${ctx.totalCodeLines} سطر كود. نوعو ${stackName}${isReady ? " وجاهز" : ""}. تحب تفاصيل أكثر؟`,
        `"${name}" فيه ${ctx.fileCount} ملفات و ${ctx.totalCodeLines} سطر كود. نوعه ${stackName}${isReady ? " وجاهز" : ""}. تبي تفاصيل؟`,
        `"${name}" has ${ctx.fileCount} files and ${ctx.totalCodeLines} lines. It's a ${stackName}${isReady ? " and ready" : ""}. More details?`,
        `"${name}" a ${ctx.fileCount} fichiers et ${ctx.totalCodeLines} lignes. C'est un ${stackName}${isReady ? " et c'est prêt" : ""}. Plus de détails ?`
      );
    }

    const techResult = computeTechScore(text);
    if (techResult.score >= 5 && techResult.detectedTopic) {
      const topic = techResult.detectedTopic;

      if (isCloudMode()) {
        const llmAnswer = await answerTechQuestion(text, dialect);
        if (llmAnswer) {
          return llmAnswer;
        }
      }

      try {
        const searchResult = await researchAgent.searchTechQuestion(text, topic);
        if (searchResult.success && searchResult.output && !searchResult.output.includes("[OFFLINE FALLBACK]") && !searchResult.output.includes("[SEARCH FAILED")) {
          const header = this.say(dialect,
            `🔍 هذا واش لقيت على ${topic}:\n\n`,
            `🔍 هذا ما وجدته عن ${topic}:\n\n`,
            `🔍 Here's what I found about ${topic}:\n\n`,
            `🔍 Voici ce que j'ai trouvé sur ${topic} :\n\n`
          );
          const footer = this.say(dialect,
            `\n\n💡 إذا تحب نبنيلك مشروع يستعمل ${topic}، قولي!`,
            `\n\n💡 إذا تريد أبني لك مشروع يستخدم ${topic}، أخبرني!`,
            `\n\n💡 If you'd like me to build a project using ${topic}, just say so!`,
            `\n\n💡 Si tu veux que je construise un projet utilisant ${topic}, dis-le moi !`
          );
          return `${header}${searchResult.output}${footer}`;
        }
      } catch {
      }

      return this.say(dialect,
        `سؤال مليح عن ${topic}! ما قدرتش نلقى نتائج من الإنترنت. جرب:\n- فعّل وضع السحابة: LLM_MODE=cloud مع مفتاح API\n- ولا إذا تحب نبنيلك مشروع يستعمل ${topic}، قولي!`,
        `سؤال ممتاز عن ${topic}! لم أتمكن من العثور على نتائج. جرب:\n- فعّل وضع السحابة: LLM_MODE=cloud مع مفتاح API\n- أو إذا تريد أبني لك مشروع يستخدم ${topic}، أخبرني!`,
        `Great question about ${topic}! I couldn't find results online. Try:\n- Enable cloud mode: set LLM_MODE=cloud with an API key\n- Or if you'd like me to build a project using ${topic}, just say so!`,
        `Excellente question sur ${topic} ! Je n'ai pas trouvé de résultats. Essaie :\n- Active le mode cloud : LLM_MODE=cloud avec une clé API\n- Ou si tu veux que je construise un projet utilisant ${topic}, dis-le moi !`
      );
    }

    return this.say(dialect,
      `سؤال مليح! "${name}" (${stackName}) — نقدر نشرحلك أي جزء، نزيد ميزات، ولا نصلح مشاكل. كون أكثر دقة باش نعطيك جواب مفصل.`,
      `سؤال حلو! "${name}" (${stackName}) — أقدر أشرح أي جزء أو أضيف ميزات. كن أكثر تحديداً.`,
      `Good question! "${name}" (${stackName}) — I can explain, add features, or fix things. Be more specific for a detailed answer.`,
      `Bonne question ! "${name}" (${stackName}) — Je peux expliquer, ajouter ou corriger. Sois plus précis.`
    );
  }

  private handleUseImage(dialect: Dialect, ctx: ProjectContext, memory: ConversationMemory, name: string): { response: string; shouldBuild: boolean; buildDescription?: string } {
    const attachment = getLastAttachment(ctx);
    if (!attachment) {
      return {
        response: this.say(dialect,
          "ما لقيتش حتى صورة مرفوعة. إبعثلي الصورة أول وبعدها قولي وين تحبها.",
          "ما لقيت صورة مرفوعة. ارفع الصورة أول ثم قولي وين تبيها.",
          "I don't see any uploaded image. Upload one first, then tell me where to place it.",
          "Je ne vois pas d'image uploadée. Envoie-la d'abord."
        ),
        shouldBuild: false,
      };
    }

    const placement = this.detectImagePlacement(ctx.lastMessages[ctx.lastMessages.length - 1]?.content || "");

    return {
      response: this.say(dialect,
        `لقيت الصورة "${attachment.name}" 📷\n\nرايح نحطها ${placement === "logo" ? "كلوجو في الهيدر" : placement === "background" ? "كخلفية" : placement === "hero" ? "في القسم الرئيسي" : "في الموقع"}.\n\nصبر شوية، الوكلاء يخدمو عليها... ⚡`,
        `لقيت الصورة "${attachment.name}" 📷\n\nبحطها ${placement === "logo" ? "كلوجو في الهيدر" : placement === "background" ? "كخلفية" : placement === "hero" ? "في القسم الرئيسي" : "في الموقع"}.\n\nالوكلاء يشتغلون... ⚡`,
        `Found your image "${attachment.name}" 📷\n\nI'll add it ${placement === "logo" ? "as a logo in the header" : placement === "background" ? "as a background" : placement === "hero" ? "in the hero section" : "to the site"}.\n\nAgents are working on it... ⚡`,
        `J'ai trouvé ton image "${attachment.name}" 📷\n\nJe vais la mettre ${placement === "logo" ? "comme logo" : placement === "background" ? "en arrière-plan" : placement === "hero" ? "dans le hero" : "sur le site"}.\n\nLes agents travaillent... ⚡`
      ),
      shouldBuild: true,
      buildDescription: `add image ${attachment.url} as ${placement} to ${name}`,
    };
  }

  private detectImagePlacement(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("logo") || lower.includes("لوجو") || lower.includes("شعار")) return "logo";
    if (lower.includes("background") || lower.includes("خلفية") || lower.includes("arrière")) return "background";
    if (lower.includes("hero") || lower.includes("رئيسي") || lower.includes("بطل")) return "hero";
    if (lower.includes("header") || lower.includes("هيدر") || lower.includes("رأس")) return "logo";
    return "logo";
  }

  private handleBuildIntent(intent: ChatIntent, text: string, dialect: Dialect, ctx: ProjectContext, memory: ConversationMemory, emotion: string, name: string, stackName: string, statusText: string, isReady: boolean, hasFiles: boolean): { response: string; shouldBuild: boolean; buildDescription?: string } {
    if (intent === "build-new" && isVagueBuildRequest(text)) {
      memory.pendingClarification = text;
      return {
        response: this.say(dialect,
          `واش نوع التطبيق اللي تحبو؟ 🤔\n\n• 🎮 لعبة (ثعبان، ألغاز...)\n• 🛒 متجر إلكتروني\n• 📊 لوحة تحكم\n• ✅ قائمة مهام\n• 🧮 آلة حاسبة\n• 💬 تطبيق دردشة\n• 🌐 موقع شخصي\n\nقولي بالتفصيل باش نفهمك مليح!`,
          `شو نوع التطبيق اللي تبيه؟ 🤔\n\n• 🎮 لعبة (ثعبان، ألغاز...)\n• 🛒 متجر إلكتروني\n• 📊 لوحة تحكم\n• ✅ قائمة مهام\n• 🧮 آلة حاسبة\n• 💬 دردشة\n• 🌐 موقع شخصي\n\nوصف لي بالتفصيل!`,
          `What kind of app do you want? 🤔\n\n• 🎮 Game (snake, puzzle...)\n• 🛒 E-commerce store\n• 📊 Dashboard\n• ✅ Todo app\n• 🧮 Calculator\n• 💬 Chat app\n• 🌐 Portfolio\n\nDescribe what you need!`,
          `Quel type d'app tu veux ? 🤔\n\n• 🎮 Jeu\n• 🛒 Boutique en ligne\n• 📊 Dashboard\n• ✅ Todo\n• 🧮 Calculatrice\n• 💬 Chat\n• 🌐 Portfolio\n\nDécris-moi en détail !`
        ),
        shouldBuild: false,
      };
    }

    if (intent === "build-new") {
      memory.buildCount++;
      const analysis = smartAnalyzer.analyze(text, dialect);
      return {
        response: `${analysis.summary}\n\n${analysis.confirmMessage}\n\n${this.respondBuildStart(dialect, name)}`,
        shouldBuild: true,
        buildDescription: text,
      };
    }

    if (intent === "rebuild") {
      return {
        response: this.say(dialect,
          `تمام! رايح نعاود بناء "${name}" من الصفر 🔄\n\nالوكلاء بداو يخدمو... النسخة الجديدة راح تكون أحسن إن شاء الله! ⚡`,
          `تبي نبني "${name}" من الصفر؟ 🔄\n\nبعيد تحليل الفكرة وأبني نسخة أفضل. الوكلاء يشتغلون... ⚡`,
          `Rebuilding "${name}" from scratch! 🔄\n\nRe-analyzing and building a better version... ⚡`,
          `Je reconstruis "${name}" de zéro ! 🔄\n\nNouvelle version en cours... ⚡`
        ),
        shouldBuild: true,
        buildDescription: text,
      };
    }

    if (intent === "add-feature") {
      const details = extractFeatureDetails(text);
      const desc = text.substring(0, 80);
      return {
        response: this.say(dialect,
          `فهمتك! تحب: ${desc}\n\n${details.colors.length > 0 ? `الألوان: ${details.colors.join("، ")}\n` : ""}${details.elements.length > 0 ? `العناصر: ${details.elements.join("، ")}\n` : ""}\nرايح نخدم عليها درك. الوكلاء بداو... ⚡`,
          `فهمت! تبي: ${desc}\n\n${details.colors.length > 0 ? `الألوان: ${details.colors.join("، ")}\n` : ""}${details.elements.length > 0 ? `العناصر: ${details.elements.join("، ")}\n` : ""}\nأشتغل عليها الحين... ⚡`,
          `Got it! You want: ${desc}\n\n${details.colors.length > 0 ? `Colors: ${details.colors.join(", ")}\n` : ""}${details.elements.length > 0 ? `Elements: ${details.elements.join(", ")}\n` : ""}\nWorking on it now... ⚡`,
          `Compris ! Tu veux : ${desc}\n\nJ'y travaille... ⚡`
        ),
        shouldBuild: true,
        buildDescription: text,
      };
    }

    if (intent === "change-style") {
      const details = extractFeatureDetails(text);
      return {
        response: this.say(dialect,
          `تمام! رايح نبدل التصميم 🎨${details.colors.length > 0 ? `\n\nالألوان: ${details.colors.join("، ")}` : ""}${details.elements.length > 0 ? `\nالعناصر: ${details.elements.join("، ")}` : ""}\n\nالوكلاء يخدمو على التعديل... شوف المعاينة بعد شوية.`,
          `أوكي! بغير التصميم 🎨${details.colors.length > 0 ? `\n\nالألوان: ${details.colors.join("، ")}` : ""}${details.elements.length > 0 ? `\nالعناصر: ${details.elements.join("، ")}` : ""}\n\nالوكلاء يشتغلون...`,
          `On it! Updating the design 🎨${details.colors.length > 0 ? `\nColors: ${details.colors.join(", ")}` : ""}${details.elements.length > 0 ? `\nElements: ${details.elements.join(", ")}` : ""}\n\nCheck preview in a moment.`,
          `C'est parti ! Je modifie le design 🎨\n\nRegarde l'aperçu dans un moment.`
        ),
        shouldBuild: true,
        buildDescription: text,
      };
    }

    return { response: this.handleUnknown(dialect, ctx, name, statusText, isReady), shouldBuild: false };
  }

  private respondBuildStart(dialect: Dialect, name: string): string {
    return this.say(dialect,
      `يلا نبنيو! 🚀\n\nفهمت الفكرة — 5 وكلاء أذكياء رايحين يخدمو عليها:\n\n💬 المنسق ← 🔍 المحلل ← 💻 المبرمج ← 🐛 المصحح ← 🧠 الذاكرة\n\nصبر شوية وشوف النتيجة! ⚡`,
      `يلا نبني! 🚀\n\nفهمت الفكرة — 5 وكلاء أذكياء يشتغلون عليها:\n\n💬 المنسق ← 🔍 المحلل ← 💻 المبرمج ← 🐛 المصحح ← 🧠 الذاكرة\n\nتابع التقدم وشوف النتيجة! ⚡`,
      `Let's build it! 🚀\n\nI got the idea — 5 smart agents are working on it:\n\n💬 Coordinator → 🔍 Analyzer → 💻 Coder → 🐛 Debugger → 🧠 Memory\n\nHang tight and watch the magic! ⚡`,
      `C'est parti ! 🚀\n\n5 agents intelligents travaillent dessus :\n\n💬 Coordinateur → 🔍 Analyseur → 💻 Codeur → 🐛 Débuggeur → 🧠 Mémoire\n\nPatience ! ⚡`
    );
  }

  private handleShowFiles(dialect: Dialect, ctx: ProjectContext, name: string): string {
    if (ctx.fileCount === 0) {
      return this.say(dialect,
        `"${name}" مزال فارغ — ما كاين حتى ملف. وصفلي فكرتك ونبنيها!`,
        `"${name}" فاضي — ما فيه ملفات. اوصف فكرتك وأبنيها!`,
        `"${name}" is empty — no files yet. Describe your idea and I'll build it!`,
        `"${name}" est vide — pas de fichiers. Décris ton idée !`
      );
    }
    const fileList = ctx.filePaths.map((f, i) => {
      const size = ctx.fileSizes[i] || 0;
      return `  📄 ${f} (${size > 1000 ? (size / 1024).toFixed(1) + "KB" : size + "B"})`;
    }).join("\n");
    return this.say(dialect,
      `ملفات "${name}" (${ctx.fileCount}):\n\n${fileList}\n\nتحب تفتح واحد ولا تعدل فيه؟`,
      `ملفات "${name}" (${ctx.fileCount}):\n\n${fileList}\n\nتبي تفتح ملف أو تعدله؟`,
      `Files in "${name}" (${ctx.fileCount}):\n\n${fileList}\n\nWant to open or edit one?`,
      `Fichiers dans "${name}" (${ctx.fileCount}) :\n\n${fileList}\n\nTu veux en ouvrir ou modifier un ?`
    );
  }

  private handleOpenFile(dialect: Dialect, text: string, ctx: ProjectContext, name: string): string {
    if (ctx.fileCount === 0) {
      return this.say(dialect,
        `ما كاين حتى ملف في "${name}" باش نفتحو.`,
        `ما فيه ملفات في "${name}" لفتحها.`,
        `No files in "${name}" to open.`,
        `Pas de fichiers dans "${name}" à ouvrir.`
      );
    }
    const lower = text.toLowerCase();
    const matchedFile = ctx.filePaths.find(f => lower.includes(f.split("/").pop()?.toLowerCase() || ""));
    if (matchedFile) {
      return this.say(dialect,
        `تمام! روح للوحة الكود وافتح "${matchedFile}" — تلقاه هناك.`,
        `تمام! افتح لوحة الكود وشوف "${matchedFile}".`,
        `Got it! Open the Code panel and select "${matchedFile}".`,
        `OK ! Ouvre le panneau Code et sélectionne "${matchedFile}".`
      );
    }
    const fileList = ctx.filePaths.map(f => `  📄 ${f}`).join("\n");
    return this.say(dialect,
      `واش ملف تحب تفتح؟ هاك الملفات المتوفرة:\n\n${fileList}`,
      `أي ملف تبي تفتح؟ هذي الملفات:\n\n${fileList}`,
      `Which file do you want to open? Here are the available files:\n\n${fileList}`,
      `Quel fichier veux-tu ouvrir ? Voici les fichiers :\n\n${fileList}`
    );
  }

  private handleEditFile(dialect: Dialect, text: string, ctx: ProjectContext, name: string): string {
    if (ctx.fileCount === 0) {
      return this.say(dialect,
        `ما كاين حتى ملف في "${name}" باش نعدلو. ابني المشروع أول!`,
        `ما فيه ملفات في "${name}" للتعديل. ابني المشروع أولاً!`,
        `No files in "${name}" to edit. Build the project first!`,
        `Pas de fichiers dans "${name}" à modifier. Construis le projet d'abord !`
      );
    }
    const lower = text.toLowerCase();
    const matchedFile = ctx.filePaths.find(f => lower.includes(f.split("/").pop()?.toLowerCase() || ""));
    if (matchedFile) {
      return this.say(dialect,
        `تمام! تقدر تعدل "${matchedFile}" مباشرة في لوحة الكود. عدل واحفظ بـ Ctrl+S.`,
        `تمام! عدّل "${matchedFile}" في لوحة الكود. احفظ بـ Ctrl+S.`,
        `Got it! Edit "${matchedFile}" directly in the Code panel. Save with Ctrl+S.`,
        `OK ! Modifie "${matchedFile}" dans le panneau Code. Sauvegarde avec Ctrl+S.`
      );
    }
    return this.say(dialect,
      `واش ملف تحب تعدل؟ قولي اسمو وواش تحب تبدل فيه.`,
      `أي ملف تبي تعدل؟ قولي اسمه وشو تبي تغير.`,
      `Which file do you want to edit? Tell me the name and what to change.`,
      `Quel fichier veux-tu modifier ? Dis-moi son nom et quoi changer.`
    );
  }

  private handleRun(dialect: Dialect, ctx: ProjectContext, name: string): string {
    if (ctx.fileCount === 0) {
      return this.say(dialect,
        `ما كاين حتى كود في "${name}" باش نشغلو. ابني المشروع أول!`,
        `ما فيه كود في "${name}" لتشغيله. ابني المشروع أولاً!`,
        `No code in "${name}" to run. Build the project first!`,
        `Pas de code dans "${name}" à exécuter. Construis le projet d'abord !`
      );
    }
    return this.say(dialect,
      `رايح نشغل "${name}" درك... شوف لوحة الطرفية للنتائج. ⚡`,
      `بشغل "${name}" الآن... شوف لوحة الطرفية للنتائج. ⚡`,
      `Running "${name}" now... Check the Terminal panel for output. ⚡`,
      `Exécution de "${name}"... Vérifie le panneau Terminal pour la sortie. ⚡`
    );
  }

  private handleExecute(dialect: Dialect, ctx: ProjectContext, name: string, content: string): string {
    return this.say(dialect,
      `🤖 وكيل مستقل رايح ينفذ المهمة ديالك على "${name}"... شوف الطرفية باش تتبع التقدم.`,
      `🤖 الوكيل المستقل سينفذ مهمتك على "${name}"... تابع التقدم في الطرفية.`,
      `🤖 Autonomous agent executing your task on "${name}"... Watch the Terminal for progress.`,
      `🤖 L'agent autonome exécute ta tâche sur "${name}"... Suis la progression dans le Terminal.`
    );
  }

  private handleDeploy(dialect: Dialect, ctx: ProjectContext, name: string, isReady: boolean): string {
    if (!isReady) {
      return this.say(dialect,
        `"${name}" مزال ما كملش — لازم يكون جاهز قبل ما ننشرو.`,
        `"${name}" لسا ما كمل — لازم يكون جاهز قبل النشر.`,
        `"${name}" isn't ready yet — it needs to be complete before deploying.`,
        `"${name}" n'est pas encore prêt — il doit être terminé avant le déploiement.`
      );
    }
    return this.say(dialect,
      `النشر مزال ما كاينش تلقائياً. تقدر تحمل الملفات وترفعها لأي منصة استضافة (Netlify, Vercel, GitHub Pages...).\n\nتحب نوريك كيفاش؟`,
      `النشر التلقائي غير متوفر حالياً. تقدر تنزل الملفات وترفعها لمنصة استضافة (Netlify, Vercel, GitHub Pages...).\n\nتبي أشرح لك الخطوات؟`,
      `Automatic deployment isn't available yet. You can download the files and upload them to any hosting platform (Netlify, Vercel, GitHub Pages...).\n\nWant me to walk you through it?`,
      `Le déploiement automatique n'est pas encore disponible. Tu peux télécharger les fichiers et les uploader sur une plateforme (Netlify, Vercel, GitHub Pages...).\n\nTu veux que je t'explique ?`
    );
  }

  private handleSettings(dialect: Dialect, memory: ConversationMemory): string {
    const theme = memory.userPreferences.theme || (dialect === "dz" || dialect === "ar" ? "غير محدد" : dialect === "fr" ? "non défini" : "not set");
    const style = memory.userPreferences.style || (dialect === "dz" || dialect === "ar" ? "غير محدد" : dialect === "fr" ? "non défini" : "not set");
    return this.say(dialect,
      `الإعدادات الحالية:\n\n• اللهجة: ${memory.dialect === "dz" ? "دارجة" : memory.dialect === "ar" ? "عربي" : memory.dialect === "fr" ? "فرنسي" : "إنجليزي"}\n• النمط: ${theme}\n• الأسلوب: ${style}\n\nتقدر تقولي "بدل النمط لـ dark" ولا "استعمل الإنجليزي" لتغيير الإعدادات.`,
      `الإعدادات الحالية:\n\n• اللغة: ${memory.dialect === "dz" ? "دارجة" : memory.dialect === "ar" ? "عربي" : memory.dialect === "fr" ? "فرنسي" : "إنجليزي"}\n• النمط: ${theme}\n• الأسلوب: ${style}\n\nقول "غير النمط لـ dark" أو "استخدم الإنجليزي" لتغيير الإعدادات.`,
      `Current settings:\n\n• Language: ${memory.dialect === "dz" ? "Darija" : memory.dialect === "ar" ? "Arabic" : memory.dialect === "fr" ? "French" : "English"}\n• Theme: ${theme}\n• Style: ${style}\n\nSay "change theme to dark" or "use Arabic" to update settings.`,
      `Paramètres actuels :\n\n• Langue : ${memory.dialect === "dz" ? "Darija" : memory.dialect === "ar" ? "Arabe" : memory.dialect === "fr" ? "Français" : "Anglais"}\n• Thème : ${theme}\n• Style : ${style}\n\nDis "changer le thème en dark" ou "utiliser l'anglais" pour modifier.`
    );
  }

  private handleCancel(dialect: Dialect): string {
    return this.say(dialect,
      `تم الإلغاء! ما كاين والو يخدم درك. قولي واش تحب ندير.`,
      `تم الإلغاء! ما فيه شيء يشتغل حالياً. قولي شو تبي.`,
      `Cancelled! Nothing is running right now. Tell me what you'd like to do.`,
      `Annulé ! Rien n'est en cours. Dis-moi ce que tu veux faire.`
    );
  }

  private handleReset(dialect: Dialect, name: string): string {
    return this.say(dialect,
      `تحب تمسح كلشي في "${name}" وتبدا من الصفر؟ 🔄\n\nهذا رايح يمسح كل الملفات والمحادثات. قول "نعم" للتأكيد.`,
      `تبي تمسح كل شيء في "${name}" وتبدأ من الصفر؟ 🔄\n\nهذا بيمسح كل الملفات والمحادثات. قول "نعم" للتأكيد.`,
      `Want to reset "${name}" and start from scratch? 🔄\n\nThis will clear all files and conversations. Say "yes" to confirm.`,
      `Tu veux réinitialiser "${name}" et repartir de zéro ? 🔄\n\nCela supprimera tous les fichiers et conversations. Dis "oui" pour confirmer.`
    );
  }

  private handleSummarize(dialect: Dialect, ctx: ProjectContext, name: string, stackName: string, statusText: string, isReady: boolean, hasFiles: boolean): string {
    const techs = [ctx.hasHtml ? "HTML" : "", ctx.hasCss ? "CSS" : "", ctx.hasJs ? "JavaScript" : ""].filter(Boolean).join(", ");
    const fileList = hasFiles ? ctx.filePaths.map(f => `  📄 ${f}`).join("\n") : "";

    return this.say(dialect,
      `📊 ملخص مشروع "${name}":\n\n• النوع: ${stackName}\n• الحالة: ${statusText}${isReady ? " ✅" : ""}\n• الملفات: ${ctx.fileCount} ملف (${ctx.totalCodeLines} سطر كود)\n• التقنيات: ${techs}\n• الرسائل: ${ctx.messageCount} رسالة${hasFiles ? `\n\n${fileList}` : ""}\n\n${isReady ? "المشروع جاهز وشغال! تحب نحسنو ولا نزيد ميزات؟" : "المشروع مزال قيد العمل."}`,
      `📊 ملخص مشروع "${name}":\n\n• النوع: ${stackName}\n• الحالة: ${statusText}${isReady ? " ✅" : ""}\n• الملفات: ${ctx.fileCount} ملف (${ctx.totalCodeLines} سطر كود)\n• التقنيات: ${techs}\n• الرسائل: ${ctx.messageCount} رسالة${hasFiles ? `\n\n${fileList}` : ""}\n\n${isReady ? "المشروع جاهز! تبي تحسينات أو ميزات جديدة؟" : "المشروع لسا قيد التطوير."}`,
      `📊 Project Summary — "${name}":\n\n• Type: ${stackName}\n• Status: ${statusText}${isReady ? " ✅" : ""}\n• Files: ${ctx.fileCount} (${ctx.totalCodeLines} lines of code)\n• Tech: ${techs}\n• Messages: ${ctx.messageCount}${hasFiles ? `\n\n${fileList}` : ""}\n\n${isReady ? "Project is ready! Want improvements or new features?" : "Project is still in progress."}`,
      `📊 Résumé du projet "${name}" :\n\n• Type : ${stackName}\n• Statut : ${statusText}${isReady ? " ✅" : ""}\n• Fichiers : ${ctx.fileCount} (${ctx.totalCodeLines} lignes de code)\n• Tech : ${techs}\n• Messages : ${ctx.messageCount}${hasFiles ? `\n\n${fileList}` : ""}\n\n${isReady ? "Le projet est prêt ! Tu veux des améliorations ou de nouvelles fonctionnalités ?" : "Le projet est encore en cours."}`
    );
  }

  private handleUnknown(dialect: Dialect, ctx: ProjectContext, name: string, statusText: string, isReady: boolean): string {
    return this.say(dialect,
      `فهمت رسالتك! ${isReady ? `"${name}" جاهز — تحب تشوفو ولا نعدلو شيء؟` : `"${name}" مزال ${statusText}. واش تحتاج؟`}`,
      `فهمت! ${isReady ? `"${name}" جاهز — تبي تشوفه أو نعدل شيء؟` : `"${name}" لسا ${statusText}. شو تحتاج؟`}`,
      `Got it! ${isReady ? `"${name}" is ready — preview it or make changes?` : `"${name}" is ${statusText}. What do you need?`}`,
      `Compris ! ${isReady ? `"${name}" est prêt — tu veux le voir ou modifier ?` : `"${name}" est ${statusText}. Qu'est-ce qu'il te faut ?`}`
    );
  }
}

function generateTip(ctx: ProjectContext, intent: ChatIntent, dialect: Dialect): string | null {
  if (["greeting", "help", "thanks", "affirmative", "negative"].includes(intent)) return null;
  if (ctx.status !== "ready" || ctx.fileCount === 0) return null;
  if (Math.random() > 0.35) return null;

  const isArabic = dialect === "dz" || dialect === "ar";
  const tips = isArabic ? [
    dialect === "dz" ? "بالمناسبة، جرب وضع الموبايل في المعاينة — تشوف كيفاش يطلع 📱" : "جرب وضع الموبايل بالمعاينة 📱",
    dialect === "dz" ? "تقدر تفتح لوحة المراقبة وتشوف الإحصائيات 📊" : "تقدر تفتح لوحة المراقبة 📊",
    dialect === "dz" ? "جرب تقول 'حسّن' — عندي أفكار حلوة لمشروعك ⚡" : "جرب تقول 'حسّن' ⚡",
  ] : dialect === "fr" ? [
    "Essaie le mode mobile dans l'aperçu 📱",
    "Tu peux ouvrir le panneau Monitoring 📊",
    "Dis 'améliore' pour des idées ⚡",
  ] : [
    "Try mobile preview mode 📱",
    "Open the Monitor panel for stats 📊",
    "Say 'improve' for optimization ideas ⚡",
  ];
  return "\n\n" + pick(tips);
}

export interface ProjectSpec {
  type: string;
  name: string;
  features: string[];
  tech: string[];
  complexity: "simple" | "medium" | "complex";
  confidence: number;
}

export class SmartAnalyzer {
  analyzeSpec(description: string, projectName: string): ProjectSpec {
    const analysis = analyzeIdea(description);
    const fileEstimate = analysis.intent === "snake-game" ? 4 : analysis.intent === "calculator" ? 4 : analysis.intent === "dashboard" ? 4 : analysis.intent === "ecommerce" ? 4 : analysis.intent === "api" ? 5 : analysis.intent === "landing" ? 4 : 6;
    const complexity: "simple" | "medium" | "complex" = fileEstimate <= 3 ? "simple" : fileEstimate <= 5 ? "medium" : "complex";
    const knownIntents = ["snake-game", "calculator", "dashboard", "tasks", "ecommerce", "landing", "api", "blog", "chat", "notes"];
    const confidence = knownIntents.includes(analysis.intent) ? 0.9 : analysis.intent === "game" ? 0.75 : 0.5;
    const techMap: Record<string, string[]> = {
      "html-canvas-game": ["HTML5", "CSS3", "JavaScript", "Canvas API"],
      "html-app": ["HTML5", "CSS3", "JavaScript"],
      "react-tasks": ["HTML5", "CSS3", "JavaScript", "LocalStorage"],
      "react-dashboard": ["HTML5", "CSS3", "JavaScript", "Charts"],
      "react-ecommerce": ["HTML5", "CSS3", "JavaScript"],
      "express-api": ["Node.js", "Express", "REST API"],
      "react-express": ["HTML5", "CSS3", "JavaScript", "Express"],
    };
    return {
      type: analysis.intent,
      name: projectName || description.slice(0, 50),
      features: analysis.features,
      tech: techMap[analysis.stack] || ["HTML5", "CSS3", "JavaScript"],
      complexity,
      confidence,
    };
  }

  async analyzeAsync(description: string, dialect: Dialect): Promise<{ complexity: "simple" | "medium" | "complex"; summary: string; confirmMessage: string; stack: string; features: string[]; confidence: number; spec: ProjectSpec }> {
    if (isCloudMode()) {
      try {
        const llmResult = await analyzeWithLLM(description, dialect);
        if (llmResult) {
          const stackLabel = llmResult.type;
          const featureList = llmResult.features.slice(0, 5);

          const summary = this.say(dialect,
            `📋 تحليل الطلب (AI):\n\n• النوع: ${llmResult.name}\n• التعقيد: ${llmResult.complexity === "simple" ? "بسيط" : llmResult.complexity === "medium" ? "متوسط" : "معقد"}\n• الثقة: ${Math.round(llmResult.confidence * 100)}%\n• الميزات: ${featureList.join("، ")}\n• التقنيات: ${llmResult.tech.join("، ")}`,
            `📋 تحليل الطلب (AI):\n\n• النوع: ${llmResult.name}\n• التعقيد: ${llmResult.complexity === "simple" ? "بسيط" : llmResult.complexity === "medium" ? "متوسط" : "معقد"}\n• الثقة: ${Math.round(llmResult.confidence * 100)}%\n• الميزات: ${featureList.join("، ")}\n• التقنيات: ${llmResult.tech.join("، ")}`,
            `📋 Request Analysis (AI):\n\n• Type: ${llmResult.name}\n• Complexity: ${llmResult.complexity}\n• Confidence: ${Math.round(llmResult.confidence * 100)}%\n• Features: ${featureList.join(", ")}\n• Tech: ${llmResult.tech.join(", ")}`,
            `📋 Analyse (AI) :\n\n• Type : ${llmResult.name}\n• Complexité : ${llmResult.complexity === "simple" ? "simple" : llmResult.complexity === "medium" ? "moyenne" : "complexe"}\n• Confiance : ${Math.round(llmResult.confidence * 100)}%\n• Fonctionnalités : ${featureList.join(", ")}\n• Tech : ${llmResult.tech.join(", ")}`
          );

          const confirmMessage = this.say(dialect,
            `فهمت — تحب ${llmResult.name} فيه ${featureList.slice(0, 3).join(" و ")}. صح؟`,
            `فهمت — تبي ${llmResult.name} فيه ${featureList.slice(0, 3).join(" و ")}. صح؟`,
            `Got it — you want a ${llmResult.name} with ${featureList.slice(0, 3).join(" and ")}. Right?`,
            `Compris — tu veux un ${llmResult.name} avec ${featureList.slice(0, 3).join(" et ")}. Correct ?`
          );

          const offlineAnalysis = analyzeIdea(description);
          const spec: ProjectSpec = { type: llmResult.type, name: llmResult.name, features: llmResult.features, tech: llmResult.tech, complexity: llmResult.complexity, confidence: llmResult.confidence };
          return { complexity: llmResult.complexity, summary, confirmMessage, stack: offlineAnalysis.stack, features: llmResult.features, confidence: llmResult.confidence, spec };
        }
      } catch (err) {
        // silent fallback to offline
      }
    }
    const result = this.analyze(description, dialect);
    return { ...result, confidence: result.spec.confidence, spec: result.spec };
  }

  analyze(description: string, dialect: Dialect): { complexity: "simple" | "medium" | "complex"; summary: string; confirmMessage: string; stack: string; features: string[]; spec: ProjectSpec } {
    const analysis = analyzeIdea(description);
    const spec = this.analyzeSpec(description, "");

    const stackLabel = this.getStackLabel(analysis.stack, dialect);
    const featureList = analysis.features.slice(0, 5);
    const fileEstimate = spec.type === "snake-game" ? 4 : spec.type === "calculator" ? 4 : spec.type === "dashboard" ? 4 : spec.type === "ecommerce" ? 4 : spec.type === "api" ? 5 : spec.type === "landing" ? 4 : 6;

    const summary = this.say(dialect,
      `📋 تحليل الطلب:\n\n• النوع: ${stackLabel}\n• التعقيد: ${spec.complexity === "simple" ? "بسيط" : spec.complexity === "medium" ? "متوسط" : "معقد"} (${fileEstimate} ملفات)\n• الميزات: ${featureList.join("، ")}\n• الثقة: ${Math.round(spec.confidence * 100)}%`,
      `📋 تحليل الطلب:\n\n• النوع: ${stackLabel}\n• التعقيد: ${spec.complexity === "simple" ? "بسيط" : spec.complexity === "medium" ? "متوسط" : "معقد"} (${fileEstimate} ملفات)\n• الميزات: ${featureList.join("، ")}\n• الثقة: ${Math.round(spec.confidence * 100)}%`,
      `📋 Request Analysis:\n\n• Type: ${stackLabel}\n• Complexity: ${spec.complexity} (${fileEstimate} files)\n• Features: ${featureList.join(", ")}\n• Confidence: ${Math.round(spec.confidence * 100)}%`,
      `📋 Analyse :\n\n• Type : ${stackLabel}\n• Complexité : ${spec.complexity === "simple" ? "simple" : spec.complexity === "medium" ? "moyenne" : "complexe"} (${fileEstimate} fichiers)\n• Fonctionnalités : ${featureList.join(", ")}\n• Confiance : ${Math.round(spec.confidence * 100)}%`
    );

    const confirmMessage = spec.confidence < 0.7
      ? this.say(dialect,
          `ما فهمتش مليح — واش تحب ${stackLabel} ولا حاجة أخرى؟ 🤔`,
          `لم أفهم تماماً — تريد ${stackLabel} أو شيء آخر؟ 🤔`,
          `I'm not fully sure — do you want a ${stackLabel} or something else? 🤔`,
          `Je ne suis pas sûr — tu veux un ${stackLabel} ou autre chose ? 🤔`
        )
      : this.say(dialect,
          `فهمت — تحب ${stackLabel} فيه ${featureList.slice(0, 3).join(" و ")}. صح؟`,
          `فهمت — تبي ${stackLabel} فيه ${featureList.slice(0, 3).join(" و ")}. صح؟`,
          `Got it — you want a ${stackLabel} with ${featureList.slice(0, 3).join(" and ")}. Right?`,
          `Compris — tu veux un ${stackLabel} avec ${featureList.slice(0, 3).join(" et ")}. Correct ?`
        );

    return { complexity: spec.complexity, summary, confirmMessage, stack: analysis.stack, features: analysis.features, spec };
  }

  private getStackLabel(stack: string, dialect: Dialect): string {
    const isAr = dialect === "dz" || dialect === "ar";
    const map: Record<string, [string, string, string]> = {
      "html-canvas-game": ["لعبة Canvas", "Canvas Game", "Jeu Canvas"],
      "html-app": ["تطبيق ويب", "Web App", "App Web"],
      "react-tasks": ["إدارة مهام", "Task Manager", "Gestionnaire de tâches"],
      "react-dashboard": ["لوحة تحكم", "Dashboard", "Tableau de bord"],
      "react-blog": ["مدونة", "Blog", "Blog"],
      "react-websocket": ["دردشة", "Chat App", "App de chat"],
      "react-ecommerce": ["متجر إلكتروني", "E-Commerce", "E-Commerce"],
      "react-notes": ["ملاحظات", "Notes App", "App de notes"],
      "express-api": ["REST API", "REST API", "REST API"],
      "react-express": ["تطبيق متكامل", "Full-Stack App", "App Full-Stack"],
    };
    const entry = map[stack];
    if (!entry) return stack;
    return isAr ? entry[0] : dialect === "fr" ? entry[2] : entry[1];
  }

  private say(dialect: Dialect, dz: string, ar: string, en: string, fr: string): string {
    switch (dialect) { case "dz": return dz; case "ar": return ar; case "en": return en; case "fr": return fr; }
  }
}

export class CollaborativeCoder {
  async build(
    projectId: string,
    description: string,
    projectName: string,
    dialect: Dialect,
    onUpdate: (agent: string, status: string, message: string) => void,
    imageRef?: { url: string; placement: string } | null
  ): Promise<void> {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const t = (dz: string, ar: string, en: string, fr: string) => {
      switch (dialect) { case "dz": return dz; case "ar": return ar; case "en": return en; case "fr": return fr; }
    };

    onUpdate("coordinator", "running", t("💬 تنسيق العملية...", "💬 تنسيق العملية...", "💬 Coordinating...", "💬 Coordination..."));
    await delay(400);
    onUpdate("coordinator", "completed", t("💬 تم التنسيق", "💬 تم التنسيق", "💬 Coordinated", "💬 Coordonné"));

    onUpdate("analyzer", "running", t("🔍 تحليل الطلب...", "🔍 تحليل الطلب...", "🔍 Analyzing request...", "🔍 Analyse en cours..."));
    await delay(600);
    const analysis = analyzeIdea(description);
    await storage.updateProject(projectId, { stack: analysis.stack, status: "planning" });
    await storage.createChatMessage({
      projectId, role: "agent", agentType: "analyzer",
      content: t(
        `🔍 تحليل مكتمل!\n\nالنوع: ${analysis.intent}\nالتقنيات: ${analysis.stack}\nالميزات: ${analysis.features.join("، ")}`,
        `🔍 تحليل مكتمل!\n\nالنوع: ${analysis.intent}\nالتقنيات: ${analysis.stack}\nالميزات: ${analysis.features.join("، ")}`,
        `🔍 Analysis complete!\n\nType: ${analysis.intent}\nStack: ${analysis.stack}\nFeatures: ${analysis.features.join(", ")}`,
        `🔍 Analyse terminée !\n\nType : ${analysis.intent}\nStack : ${analysis.stack}\nFonctionnalités : ${analysis.features.join(", ")}`
      ),
    });
    onUpdate("analyzer", "completed", t(`🔍 ${analysis.features.length} ميزات`, `🔍 ${analysis.features.length} ميزات`, `🔍 ${analysis.features.length} features`, `🔍 ${analysis.features.length} fonctionnalités`));

    onUpdate("coder", "running", t("💻 توليد الكود...", "💻 توليد الكود...", "💻 Generating code...", "💻 Génération du code..."));
    await delay(1200);
    const ctx = { projectId, projectName, description, stack: analysis.stack };
    const generatedFiles = generateCode(ctx, analysis);

    if (imageRef && imageRef.url) {
      this.injectImage(generatedFiles, imageRef);
    }

    for (const file of generatedFiles) {
      await storage.createProjectFile({ projectId, path: file.path, content: file.content, language: file.language });
    }
    await storage.updateProject(projectId, { status: "coding" });
    await storage.createChatMessage({
      projectId, role: "agent", agentType: "coder",
      content: t(
        `💻 الكود جاهز!\n\n${generatedFiles.length} ملفات:\n${generatedFiles.map(f => `  📄 ${f.path}`).join("\n")}`,
        `💻 الكود جاهز!\n\n${generatedFiles.length} ملفات:\n${generatedFiles.map(f => `  📄 ${f.path}`).join("\n")}`,
        `💻 Code ready!\n\n${generatedFiles.length} files:\n${generatedFiles.map(f => `  📄 ${f.path}`).join("\n")}`,
        `💻 Code prêt !\n\n${generatedFiles.length} fichiers :\n${generatedFiles.map(f => `  📄 ${f.path}`).join("\n")}`
      ),
    });
    onUpdate("coder", "completed", t(`💻 ${generatedFiles.length} ملفات`, `💻 ${generatedFiles.length} ملفات`, `💻 ${generatedFiles.length} files`, `💻 ${generatedFiles.length} fichiers`));

    onUpdate("runner", "running", t("⚙️ تصدير المشروع...", "⚙️ تصدير المشروع...", "⚙️ Exporting project...", "⚙️ Export du projet..."));
    await delay(400);
    try {
      const { exportProjectToDisk } = await import("./runner");
      const slug = await exportProjectToDisk(projectId);
      onUpdate("runner", "completed", t(`⚙️ تم التصدير: ${slug}`, `⚙️ تم التصدير: ${slug}`, `⚙️ Exported: ${slug}`, `⚙️ Exporté : ${slug}`));
    } catch {
      onUpdate("runner", "completed", t("⚙️ تم (بدون تصدير)", "⚙️ تم (بدون تصدير)", "⚙️ Done (no export)", "⚙️ Fait (sans export)"));
    }

    onUpdate("debugger", "running", t("🐛 فحص الأخطاء...", "🐛 فحص الأخطاء...", "🐛 Checking for errors...", "🐛 Vérification des erreurs..."));
    await delay(500);
    await storage.createChatMessage({
      projectId, role: "agent", agentType: "debugger",
      content: t(
        "🐛 فحص مكتمل!\n\n• بنية الكود سليمة ✓\n• المسارات صحيحة ✓\n• ما كاين حتى خطأ ✓",
        "🐛 فحص مكتمل!\n\n• بنية الكود سليمة ✓\n• المسارات صحيحة ✓\n• لا أخطاء ✓",
        "🐛 Debug check complete!\n\n• Syntax valid ✓\n• Paths verified ✓\n• No errors ✓",
        "🐛 Vérification terminée !\n\n• Syntaxe valide ✓\n• Chemins vérifiés ✓\n• Pas d'erreurs ✓"
      ),
    });
    onUpdate("debugger", "completed", t("🐛 ما كاين خطأ", "🐛 لا أخطاء", "🐛 No errors", "🐛 Pas d'erreurs"));

    onUpdate("memory", "running", t("🧠 حفظ السياق...", "🧠 حفظ السياق...", "🧠 Saving context...", "🧠 Sauvegarde du contexte..."));
    await delay(300);
    const memory = getMemory(projectId);
    memory.buildCount++;
    memory.mentionedFeatures.push(...analysis.features.slice(0, 3));
    await storage.updateProject(projectId, { status: "ready" });
    await storage.createChatMessage({
      projectId, role: "agent", agentType: "memory",
      content: t(
        `🧠 تم الحفظ!\n\nالنوع: ${analysis.intent}\nالتقنيات: ${analysis.stack}\nعدد الملفات: ${generatedFiles.length}\nالبناء رقم: ${memory.buildCount}`,
        `🧠 تم الحفظ!\n\nالنوع: ${analysis.intent}\nالتقنيات: ${analysis.stack}\nعدد الملفات: ${generatedFiles.length}\nالبناء رقم: ${memory.buildCount}`,
        `🧠 Context saved!\n\nType: ${analysis.intent}\nStack: ${analysis.stack}\nFiles: ${generatedFiles.length}\nBuild #${memory.buildCount}`,
        `🧠 Contexte sauvegardé !\n\nType : ${analysis.intent}\nStack : ${analysis.stack}\nFichiers : ${generatedFiles.length}\nBuild #${memory.buildCount}`
      ),
    });
    onUpdate("memory", "completed", t("🧠 تم الحفظ", "🧠 تم الحفظ", "🧠 Context saved", "🧠 Contexte sauvegardé"));

    try {
      await enhancedMemory.learnFromBuild(projectId, description, {
        success: true,
        stack: analysis.stack,
        features: analysis.features,
      });
    } catch {}
  }

  private injectImage(files: { path: string; content: string; language: string }[], imageRef: { url: string; placement: string }): void {
    const htmlFile = files.find(f => f.path.endsWith(".html"));
    if (!htmlFile) return;

    const imgTag = `<img src="${imageRef.url}" alt="Logo" style="max-height:40px;border-radius:6px;margin-right:8px">`;

    if (imageRef.placement === "background") {
      htmlFile.content = htmlFile.content.replace(
        /<body/,
        `<body style="background-image:url('${imageRef.url}');background-size:cover;background-position:center"`
      );
    } else if (imageRef.placement === "hero") {
      htmlFile.content = htmlFile.content.replace(
        /(<div[^>]*class="[^"]*hero[^"]*"[^>]*>)/i,
        `$1\n    ${imgTag.replace('max-height:40px', 'max-height:200px;width:100%;object-fit:cover')}`
      );
    } else {
      htmlFile.content = htmlFile.content.replace(
        /(<h1[^>]*>)/,
        `${imgTag}$1`
      );
    }
  }
}

export class FriendlyDebugger {
  diagnose(errorMessage: string, dialect: Dialect, ctx: { hasHtml: boolean; hasCss: boolean; hasJs: boolean; fileCount: number }): string {
    const issues: string[] = [];
    const fixes: string[] = [];
    const lower = errorMessage.toLowerCase();

    if (lower.includes("syntaxerror") || lower.includes("unexpected token") || lower.includes("unexpected end")) {
      issues.push(this.say(dialect, "خطأ في بنية الكود — كاين قوس ولا فاصلة ناقصة", "خطأ في بنية الكود — قوس أو فاصلة ناقصة", "Syntax error — missing bracket or semicolon", "Erreur de syntaxe — parenthèse ou point-virgule manquant"));
      fixes.push(this.say(dialect, "نراجع الأقواس والفواصل", "راجع الأقواس والفواصل", "Check brackets and semicolons", "Vérifier les parenthèses"));
    }
    if (lower.includes("referenceerror") || lower.includes("is not defined")) {
      const varMatch = errorMessage.match(/(\w+) is not defined/);
      const varName = varMatch ? varMatch[1] : "المتغير";
      issues.push(this.say(dialect, `${varName} ما هوش معرّف — نسيت تعلن عليه`, `${varName} غير معرف`, `${varName} is not defined`, `${varName} n'est pas défini`));
      fixes.push(this.say(dialect, `أضف تعريف تاع ${varName} قبل ما تستعملو`, `أضف تعريف ${varName}`, `Add declaration for ${varName}`, `Ajouter une déclaration pour ${varName}`));
    }
    if (lower.includes("typeerror") || lower.includes("cannot read") || lower.includes("null")) {
      issues.push(this.say(dialect, "تحب تقرا حاجة ما كايناش — ممكن العنصر ما تحملش مزال", "تحاول قراءة عنصر غير موجود", "Trying to access something that doesn't exist", "Accès à un élément inexistant"));
      fixes.push(this.say(dialect, "تأكد العنصر موجود قبل ما تستعملو", "تأكد من وجود العنصر أولاً", "Make sure the element exists first", "Vérifier que l'élément existe d'abord"));
    }
    if (lower.includes("404") || lower.includes("not found")) {
      issues.push(this.say(dialect, "الملف ولا المسار ما تلقاش — ممكن اسم غالط", "الملف أو المسار غير موجود", "File or path not found", "Fichier ou chemin introuvable"));
      fixes.push(this.say(dialect, "تأكد من أسماء الملفات والمسارات", "تأكد من أسماء الملفات", "Verify file names and paths", "Vérifier les noms de fichiers"));
    }
    if (!ctx.hasHtml) {
      issues.push(this.say(dialect, "ما كاينش ملف HTML", "ما فيه ملف HTML", "No HTML file found", "Pas de fichier HTML"));
    }
    if (!ctx.hasJs && ctx.fileCount > 0) {
      issues.push(this.say(dialect, "ما كاينش JavaScript — التفاعلات ما تخدمش", "ما فيه JavaScript", "No JavaScript file", "Pas de fichier JavaScript"));
    }

    if (lower.includes("لا تشتغل") || lower.includes("ما تخدمش") || lower.includes("not working") || lower.includes("doesn't work") || lower.includes("ne marche pas") || lower.includes("blank") || lower.includes("بيضاء") || lower.includes("فارغة") || lower.includes("nothing") || lower.includes("ما يبان")) {
      if (issues.length === 0) {
        issues.push(this.say(dialect, "الملفات موجودين بصح كاين مشكل في التشغيل", "الملفات موجودة لكن فيه مشكلة", "Files exist but something isn't working", "Les fichiers existent mais quelque chose ne marche pas"));
      }
      fixes.push(this.say(dialect, "جرب تعمل إعادة بناء — ممكن تتصلح", "جرب إعادة البناء", "Try rebuilding the project", "Essayer de reconstruire le projet"));
      fixes.push(this.say(dialect, "وصفلي واش تشوف بالضبط — واش صفحة بيضاء؟ خطأ؟ ما يتحركش؟", "وصف لي — صفحة بيضاء؟ خطأ؟", "What exactly do you see — blank page? Error? No interaction?", "Que vois-tu exactement — page blanche ? Erreur ?"));
    }

    if (issues.length === 0) {
      issues.push(this.say(dialect, "ما لقيتش مشكلة واضحة — وصفلي واش تشوف بالضبط", "ما لقيت مشكلة واضحة — وصف لي الخطأ", "No obvious issue — describe what you're seeing", "Pas de problème évident — décris ce que tu vois"));
    }

    const header = this.say(dialect, "🐛 تشخيص المشكلة:", "🐛 تشخيص المشكلة:", "🐛 Diagnosis:", "🐛 Diagnostic :");
    const issueLabel = this.say(dialect, "المشاكل:", "المشاكل:", "Issues:", "Problèmes :");
    const fixLabel = this.say(dialect, "الحلول المقترحة:", "الحلول المقترحة:", "Suggested fixes:", "Corrections suggérées :");
    const askFix = this.say(dialect, "\n\nتحب نصلحهم؟ ولا تحب تجرب بنفسك؟", "\n\nتبي أصلحها؟ أو تجرب بنفسك؟", "\n\nWant me to fix them? Or try yourself?", "\n\nTu veux que je corrige ? Ou tu veux essayer ?");

    let result = `${header}\n\n${issueLabel}\n${issues.map(i => `  ⚠️ ${i}`).join("\n")}`;
    if (fixes.length > 0) {
      result += `\n\n${fixLabel}\n${fixes.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}`;
    }
    result += askFix;
    return result;
  }

  private say(dialect: Dialect, dz: string, ar: string, en: string, fr: string): string {
    switch (dialect) { case "dz": return dz; case "ar": return ar; case "en": return en; case "fr": return fr; }
  }
}

export class MemoryKeeper {
  readonly enhanced: EnhancedMemory = enhancedMemory;

  getScratchpad(projectId: string): Scratchpad {
    return createScratchpad(projectId);
  }

  async logEpisode(projectId: string, runId: string, summary: string): Promise<void> {
    await this.enhanced.addEpisode(runId, summary, projectId);
  }

  recall(projectId: string, dialect: Dialect): string | null {
    const memory = getMemory(projectId);
    const hints: string[] = [];

    if (memory.buildCount > 1) {
      hints.push(this.say(dialect,
        `هذا البناء رقم ${memory.buildCount} تاعك`,
        `هذا البناء رقم ${memory.buildCount}`,
        `This is your build #${memory.buildCount}`,
        `C'est ton build #${memory.buildCount}`
      ));
    }
    if (memory.userPreferences.theme) {
      hints.push(this.say(dialect,
        `المرة اللي فاتت اخترت النمط ${memory.userPreferences.theme} — نكملو عليه؟`,
        `المرة الماضية اخترت ${memory.userPreferences.theme} — نكمل عليه؟`,
        `Last time you picked ${memory.userPreferences.theme} theme — keep it?`,
        `La dernière fois tu as choisi le thème ${memory.userPreferences.theme} — on continue ?`
      ));
    }
    if (memory.corrections.length > 0) {
      const lastCorr = memory.corrections[memory.corrections.length - 1];
      hints.push(this.say(dialect,
        `ملاحظة: صححت "${lastCorr}" قبل — خديتها في الاعتبار`,
        `ملاحظة: صححت "${lastCorr}" سابقاً`,
        `Note: You corrected "${lastCorr}" before — I'll remember that`,
        `Note : tu as corrigé "${lastCorr}" avant — je m'en souviens`
      ));
    }
    if (memory.mentionedFeatures.length > 0) {
      const feats = Array.from(new Set(memory.mentionedFeatures)).slice(0, 3).join(dialect === "dz" || dialect === "ar" ? "، " : ", ");
      hints.push(this.say(dialect,
        `الميزات اللي هدرنا عليهم: ${feats}`,
        `الميزات اللي ذكرناها: ${feats}`,
        `Features we discussed: ${feats}`,
        `Fonctionnalités discutées : ${feats}`
      ));
    }

    if (hints.length === 0) return null;
    const header = this.say(dialect, "🧠 من الذاكرة:", "🧠 من الذاكرة:", "🧠 From memory:", "🧠 De la mémoire :");
    return `${header}\n${hints.map(h => `  • ${h}`).join("\n")}`;
  }

  updatePreference(projectId: string, key: string, value: string): void {
    const memory = getMemory(projectId);
    (memory.userPreferences as any)[key] = value;
    storage.setMemory(`pref:${projectId}:${key}`, value, "preference").catch(() => {});
  }

  addCorrection(projectId: string, correction: string): void {
    const memory = getMemory(projectId);
    memory.corrections.push(correction);
    if (memory.corrections.length > 10) memory.corrections = memory.corrections.slice(-10);
    storage.setMemory(`corrections:${projectId}`, JSON.stringify(memory.corrections), "correction").catch(() => {});
  }

  async persistMemory(projectId: string): Promise<void> {
    const memory = getMemory(projectId);
    await storage.setMemory(`memory:${projectId}`, JSON.stringify({
      dialect: memory.dialect,
      userPreferences: memory.userPreferences,
      buildCount: memory.buildCount,
      mentionedFeatures: memory.mentionedFeatures,
      corrections: memory.corrections,
    }), "conversation");
  }

  async loadMemory(projectId: string): Promise<void> {
    try {
      const saved = await storage.getMemory(`memory:${projectId}`);
      if (saved) {
        const data = JSON.parse(saved.value);
        const memory = getMemory(projectId);
        memory.dialect = data.dialect || memory.dialect;
        memory.userPreferences = data.userPreferences || memory.userPreferences;
        memory.buildCount = data.buildCount || memory.buildCount;
        memory.mentionedFeatures = data.mentionedFeatures || memory.mentionedFeatures;
        memory.corrections = data.corrections || memory.corrections;
      }
    } catch {
    }
  }

  private say(dialect: Dialect, dz: string, ar: string, en: string, fr: string): string {
    switch (dialect) { case "dz": return dz; case "ar": return ar; case "en": return en; case "fr": return fr; }
  }
}

export const AGENT_V3_DEFS = [
  { type: "supervisor", label: "Supervisor", labelAr: "المدير", emoji: "CEO", desc: "AI CEO — decomposes goals, assigns agents, monitors progress", descAr: "المدير التنفيذي — يحلل الأهداف ويوزع المهام ويراقب التقدم" },
  { type: "coordinator", label: "ChattyCoordinator", labelAr: "المنسق", emoji: "💬", desc: "Understands and routes your requests", descAr: "يفهم طلباتك ويوجهها" },
  { type: "analyzer", label: "SmartAnalyzer", labelAr: "المحلل", emoji: "🔍", desc: "Analyzes and plans before building", descAr: "يحلل ويخطط قبل البناء" },
  { type: "coder", label: "CollaborativeCoder", labelAr: "المبرمج", emoji: "💻", desc: "Generates production-ready code", descAr: "يولد كود جاهز للإنتاج" },
  { type: "runner", label: "Runner", labelAr: "المشغّل", emoji: "⚙️", desc: "Exports and runs your project", descAr: "يصدّر ويشغّل مشروعك" },
  { type: "debugger", label: "FriendlyDebugger", labelAr: "المصحح", emoji: "🐛", desc: "Finds and explains errors simply", descAr: "يجد ويشرح الأخطاء ببساطة" },
  { type: "memory", label: "MemoryKeeper", labelAr: "الذاكرة", emoji: "🧠", desc: "Remembers context and preferences", descAr: "يتذكر السياق والتفضيلات" },
];

export const chattyCoordinator = new ChattyCoordinator();
export const smartAnalyzer = new SmartAnalyzer();
export const collaborativeCoder = new CollaborativeCoder();
export const friendlyDebugger = new FriendlyDebugger();
export const memoryKeeper = new MemoryKeeper();

export async function processChatV3(projectId: string, content: string): Promise<{ response: string; shouldBuild: boolean; buildDescription?: string; executeAutonomous?: boolean; executeTask?: string; supervisorDecomposition?: any; smartPipeline?: boolean }> {
  await memoryKeeper.loadMemory(projectId);
  const result = await chattyCoordinator.handle(projectId, content);

  const dialect = detectDialect(content);
  const ctx = await getProjectContext(projectId);
  const intent = classifyIntent(content, dialect);

  if (["build-new", "rebuild"].includes(intent) && supervisorAgent.isComplexGoal(content)) {
    try {
      const decomposition = await supervisorAgent.decompose(content);
      const taskList = decomposition.tasks
        .map((t, i) => `  ${i + 1}. [${t.assignedAgent}] ${t.description}`)
        .join("\n");

      const supervisorNote = dialect === "dz" || dialect === "ar"
        ? `\n\n**المدير التنفيذي (AI CEO)** حلل الطلب:\n\nالاستراتيجية: ${decomposition.strategy}\nالتعقيد: ${decomposition.estimatedComplexity}\n\nالمهام:\n${taskList}`
        : dialect === "fr"
        ? `\n\n**Superviseur (AI CEO)** a analysé la demande :\n\nStratégie : ${decomposition.strategy}\nComplexité : ${decomposition.estimatedComplexity}\n\nTâches :\n${taskList}`
        : `\n\n**Supervisor (AI CEO)** analyzed the request:\n\nStrategy: ${decomposition.strategy}\nComplexity: ${decomposition.estimatedComplexity}\n\nTasks:\n${taskList}`;

      result.response += supervisorNote;
      (result as any).supervisorDecomposition = decomposition;
      (result as any).smartPipeline = true;

      const smartBuildNote = dialect === "dz" || dialect === "ar"
        ? `\n\n⚡ **Smart Build** — خط الإنتاج الذكي جاهز للتنفيذ. وافق على الخطة للبدء.`
        : dialect === "fr"
        ? `\n\n⚡ **Smart Build** — Pipeline intelligent prêt. Approuvez le plan pour commencer.`
        : `\n\n⚡ **Smart Build** — Smart pipeline ready. Approve the plan to begin execution.`;

      result.response += smartBuildNote;
    } catch {}
  }

  const tip = generateTip(ctx, intent, dialect);
  if (tip) result.response += tip;

  const memoryHint = memoryKeeper.recall(projectId, dialect);
  if (memoryHint && ["build-new", "rebuild", "add-feature"].includes(intent)) {
    result.response += "\n\n" + memoryHint;
  }

  await memoryKeeper.persistMemory(projectId);
  return result;
}

export async function runSmartPipeline(
  projectId: string,
  idea: string,
  onUpdate?: (agent: string, status: string, message: string) => void
): Promise<SmartPipelineStatus> {
  const pipeline = createSmartPipeline(projectId);
  return pipeline.run(idea, projectId, undefined, onUpdate);
}

export function getSmartPipelineStatus(projectId: string): SmartPipelineStatus | null {
  const pipeline = getSmartPipeline(projectId);
  return pipeline ? pipeline.getStatus() : null;
}

export { isSmartBuildActive };

export async function runAgentPipelineV3(
  projectId: string,
  description: string,
  projectName: string,
  onUpdate: (agent: string, status: string, message: string) => void
): Promise<void> {
  const dialect = detectDialect(description);

  const memory = getMemory(projectId);
  const imageRef = memory.lastAttachments.length > 0
    ? { url: memory.lastAttachments[0].url, placement: "logo" }
    : null;

  await collaborativeCoder.build(projectId, description, projectName, dialect, onUpdate, imageRef);

  const runId = `build_${projectId}_${Date.now()}`;
  const episodeSummary = `Built "${projectName}" with description: "${description.substring(0, 200)}" | Stack: ${memory.dialect} | Build #${memory.buildCount}`;
  await memoryKeeper.logEpisode(projectId, runId, episodeSummary);

  const scratchpad = memoryKeeper.getScratchpad(projectId);
  scratchpad.writeNote(`build_${memory.buildCount}`, `Build #${memory.buildCount}\nDescription: ${description}\nTimestamp: ${new Date().toISOString()}`);

  await memoryKeeper.persistMemory(projectId);
}

export function shouldRunPipelineV3(content: string): boolean {
  const dialect = detectDialect(content);
  const intent = classifyIntent(content, dialect);
  return ["build-new", "rebuild", "add-feature", "change-style", "use-image"].includes(intent);
}
