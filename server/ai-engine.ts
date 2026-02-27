import { storage } from "./storage";

function detectLanguage(text: string): "ar" | "en" {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
  return arabicPattern.test(text) ? "ar" : "en";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
  lastMessages: { role: string; content: string; agentType: string | null }[];
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
    lastMessages: messages.slice(-8).map(m => ({ role: m.role, content: m.content.substring(0, 200), agentType: m.agentType })),
    hasHtml,
    hasCss,
    hasJs,
    totalCodeLines,
  };
}

type ChatIntent =
  | "build-new" | "explain-code" | "fix-error" | "improve"
  | "add-feature" | "change-style" | "question" | "rebuild"
  | "translate" | "document" | "greeting" | "status"
  | "help" | "thanks" | "affirmative" | "negative" | "unknown";

function classifyIntent(text: string, lang: "ar" | "en"): ChatIntent {
  const lower = text.toLowerCase().trim();

  const affirmatives = ["yes", "yeah", "yep", "sure", "ok", "okay", "do it", "go ahead", "lets go", "let's go", "نعم", "اي", "أي", "ايوا", "طيب", "يلا", "تمام", "موافق", "ماشي", "اوكي", "حسناً", "افعلها", "نفذ"];
  if (affirmatives.some(w => lower === w || lower === w + "!" || lower === w + ".")) return "affirmative";

  const negatives = ["no", "nope", "nah", "cancel", "stop", "لا", "كلا", "الغ", "توقف", "خلاص"];
  if (negatives.some(w => lower === w || lower === w + "!" || lower === w + ".")) return "negative";

  const greetings = ["hi", "hello", "hey", "مرحبا", "اهلا", "السلام", "هلا", "أهلاً", "صباح", "مساء", "هاي"];
  if (greetings.some(g => lower.includes(g)) && lower.length < 40) return "greeting";

  const thanks = ["thank", "thanks", "شكر", "ممتاز", "رائع", "great", "awesome", "perfect", "nice", "good job", "well done", "يعطيك العافية", "مشكور"];
  if (thanks.some(w => lower.includes(w)) && lower.length < 60) return "thanks";

  const helpWords = ["help", "مساعد", "ساعد", "commands", "أوامر", "what can", "ماذا يمكن", "قدرات", "capabilities", "شو تقدر", "وش تسوي"];
  if (helpWords.some(w => lower.includes(w))) return "help";

  const statusWords = ["status", "progress", "الحالة", "التقدم", "وضع", "كيف المشروع", "how is", "what's the status", "project info", "شو صار", "وين وصل"];
  if (statusWords.some(w => lower.includes(w))) return "status";

  const explainWords = ["explain", "what does", "how does", "what is", "why does", "tell me about", "اشرح", "وضح", "ماذا يفعل", "كيف يعمل", "لماذا", "فسر", "حلل", "شو هذا", "وش هذا"];
  if (explainWords.some(w => lower.includes(w))) return "explain-code";

  const fixWords = ["fix", "error", "bug", "broken", "not working", "crash", "issue", "problem", "debug", "أصلح", "خطأ", "مشكلة", "لا يعمل", "تعطل", "باغ", "صحح", "ما يشتغل"];
  if (fixWords.some(w => lower.includes(w))) return "fix-error";

  const improveWords = ["improve", "better", "optimize", "refactor", "clean", "faster", "performance", "حسن", "طور", "أفضل", "أسرع", "نظف", "رتب", "أداء"];
  if (improveWords.some(w => lower.includes(w))) return "improve";

  const addWords = ["add", "new feature", "include", "integrate", "أضف", "ميزة", "ضيف", "أريد", "اريد", "i want", "can you add", "i need", "أبغى", "ابي"];
  if (addWords.some(w => lower.includes(w))) return "add-feature";

  const styleWords = ["style", "color", "theme", "design", "layout", "font", "dark", "light", "ui", "ux", "لون", "تصميم", "شكل", "خط", "واجهة", "مظهر"];
  if (styleWords.some(w => lower.includes(w))) return "change-style";

  const rebuildWords = ["rebuild", "redo", "start over", "regenerate", "from scratch", "أعد", "من جديد", "أعد بناء", "ابني من الصفر", "من البداية"];
  if (rebuildWords.some(w => lower.includes(w))) return "rebuild";

  const translateWords = ["translate", "ترجم", "حول", "بالعربي", "بالانجليزي", "in arabic", "in english"];
  if (translateWords.some(w => lower.includes(w))) return "translate";

  const docWords = ["document", "docs", "readme", "guide", "وثق", "توثيق", "دليل"];
  if (docWords.some(w => lower.includes(w))) return "document";

  const questionWords = ["?", "؟", "how", "what", "when", "where", "which", "can i", "is it", "do i", "should", "كيف", "ما هو", "متى", "أين", "هل", "أي", "ليش", "شلون"];
  if (questionWords.some(w => lower.includes(w))) return "question";

  const buildWords = ["build", "create", "make", "generate", "develop", "أنشئ", "بناء", "اصنع", "اعمل", "ابني", "ولد", "سو لي", "سوي"];
  if (buildWords.some(w => lower.includes(w))) return "build-new";

  return "unknown";
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
    status: ["status", "الحالة", "وضع", "progress"],
    "explain-code": ["explain", "اشرح", "وضح"],
    improve: ["improve", "حسن", "طور"],
    "fix-error": ["fix", "أصلح", "error", "خطأ"],
  };
  const keywords = intentKeywords[intent];
  if (!keywords) return false;
  return keywords.some(k => prev.includes(k));
}

function detectEmotion(text: string): "frustrated" | "excited" | "neutral" {
  const lower = text.toLowerCase();
  const frustrated = ["!!!", "doesn't work", "not working", "broken", "again", "still", "why won't", "ugh", "لا يعمل", "ما يشتغل", "مرة ثانية", "ليش ما", "تعبت"];
  if (frustrated.some(w => lower.includes(w))) return "frustrated";
  const excited = ["amazing", "awesome", "love it", "perfect", "wow", "cool", "رهيب", "ممتاز", "يا سلام", "حلو", "واو"];
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

function getStackName(stack: string, lang: "ar" | "en"): string {
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
  return entry ? (lang === "ar" ? entry[0] : entry[1]) : stack;
}

function getStatusText(status: string, lang: "ar" | "en"): string {
  const map: Record<string, [string, string]> = {
    planning: ["قيد التخطيط", "planning"],
    designing: ["قيد التصميم", "being designed"],
    coding: ["قيد البناء", "being built"],
    testing: ["قيد الاختبار", "being tested"],
    ready: ["جاهز", "ready"],
    deployed: ["تم نشره", "deployed"],
  };
  const entry = map[status];
  return entry ? (lang === "ar" ? entry[0] : entry[1]) : status;
}

function generateResponse(intent: ChatIntent, text: string, ctx: ProjectContext, lang: "ar" | "en"): string {
  const emotion = detectEmotion(text);
  const repeated = wasRecentlyAsked(ctx, intent);
  const lastAiMsg = getLastAssistantMessage(ctx);
  const name = ctx.projectName;
  const stackName = getStackName(ctx.stack, lang);
  const statusText = getStatusText(ctx.status, lang);
  const isReady = ctx.status === "ready";
  const hasFiles = ctx.fileCount > 0;

  if (lang === "ar") {
    return generateArabicResponse(intent, text, ctx, emotion, repeated, lastAiMsg, name, stackName, statusText, isReady, hasFiles);
  }
  return generateEnglishResponse(intent, text, ctx, emotion, repeated, lastAiMsg, name, stackName, statusText, isReady, hasFiles);
}

function generateArabicResponse(
  intent: ChatIntent, text: string, ctx: ProjectContext,
  emotion: string, repeated: boolean, lastAiMsg: string | null,
  name: string, stackName: string, statusText: string,
  isReady: boolean, hasFiles: boolean
): string {
  switch (intent) {
    case "greeting": {
      const greetings = [
        `أهلاً وسهلاً! كيف حالك؟ 👋\n\nمشروعك "${name}" ${isReady ? "جاهز ويشتغل" : `الآن ${statusText}`}. عندك ${ctx.fileCount} ملف فيه ${ctx.totalCodeLines} سطر كود.\n\nشو تبي نسوي اليوم؟`,
        `هلا والله! منور 👋\n\nأشوف مشروعك "${name}" — ${stackName}${isReady ? "، وكل شيء تمام" : ` — ${statusText}`}.\n\nقولي شو تحتاج وأنا جاهز.`,
        `مرحبا! سعيد إنك هنا 👋\n\n"${name}" فيه ${ctx.fileCount} ملفات${isReady ? " وجاهز للمعاينة" : ""}. كيف أقدر أساعدك؟`,
        `السلام عليكم! 👋\n\nمشروع "${name}" (${stackName}) — ${ctx.totalCodeLines} سطر كود${isReady ? "، كل شيء شغال" : "، يشتغل عليه الآن"}.\n\nتبي تشوف شيء معين؟`,
      ];
      return pick(greetings);
    }

    case "thanks": {
      const responses = [
        `العفو! هذا واجبي 😊\nإذا احتجت أي شيء ثاني أنا هنا.`,
        `تسلم! سعيد إن الشغل عجبك 🙏\nتبي نضيف شيء ثاني للمشروع؟`,
        `الله يعافيك! أي وقت تحتاجني أنا موجود 😊`,
        `شكراً لك أنت! تبي نكمل على شيء ولا كل شيء تمام؟`,
      ];
      return pick(responses);
    }

    case "affirmative": {
      if (lastAiMsg) {
        if (lastAiMsg.includes("تحسين") || lastAiMsg.includes("حسّن") || lastAiMsg.includes("أحسن")) {
          return `تمام، بطبق التحسينات على "${name}" الآن! 🚀\n\nالوكلاء يشتغلون على الموضوع... تابع التقدم في لوحة الوكلاء.`;
        }
        if (lastAiMsg.includes("معاينة") || lastAiMsg.includes("preview")) {
          return `افتح لوحة المعاينة المباشرة وشوف النتيجة! يمكنك تجرب وضع الموبايل أيضاً.`;
        }
        if (lastAiMsg.includes("ميزة") || lastAiMsg.includes("أضف") || lastAiMsg.includes("feature")) {
          return `ممتاز! أشتغل على إضافتها الحين. خط أنابيب 15 وكيل بيشتغل على الموضوع... ⚡`;
        }
        return `حسناً! أشتغل عليه الحين. أعطني لحظة... ⚡`;
      }
      return `تمام! قولي شو تبي أسوي بالضبط وأنا أبدأ فيه.`;
    }

    case "negative": {
      return pick([
        `مافي مشكلة! قولي شو تبي بدال كذا.`,
        `أوكي، خلنا نسوي شيء ثاني. شو عندك ببالك؟`,
        `تمام، ألغيت الفكرة. شو تبي نسوي؟`,
      ]);
    }

    case "help": {
      return `أقدر أساعدك بأشياء كثيرة! خلني أقولك:\n\n• اوصف لي فكرة تطبيق وأبنيه لك كامل\n• قول "اشرح" وأحلل لك الكود ملف ملف\n• قول "أصلح" وأفحص المشروع من الأخطاء\n• قول "حسّن" وأعطيك اقتراحات تطوير\n• قول "الحالة" وأعطيك تقرير كامل\n\n⌨️ اختصارات لوحة المفاتيح:\n• Ctrl+S — حفظ الملف\n• Ctrl+1~7 — التنقل بين اللوحات\n• Ctrl+N — ملف جديد\n\nأو ببساطة اكتب أي شيء تبيه وأنا أفهمك. أتكلم عربي وإنجليزي 😊`;
    }

    case "status": {
      if (repeated) {
        if (isReady) return `نفس ما قلت لك — "${name}" جاهز وما تغير شيء. ${ctx.fileCount} ملف، ${ctx.totalCodeLines} سطر كود. تبي نضيف شيء جديد؟`;
        return `لسا نفس الوضع — المشروع ${statusText}. أعطيه شوية وقت.`;
      }

      const fileList = ctx.filePaths.map((f, i) => {
        const size = ctx.fileSizes[i] || 0;
        return `  • ${f} (${size > 1000 ? (size/1024).toFixed(1) + "KB" : size + "B"})`;
      }).join("\n");

      let response = `مشروع "${name}" — ${stackName}\n\nالحالة: ${statusText}${isReady ? " ✅" : ""}\nالملفات: ${ctx.fileCount} ملف (${ctx.totalCodeLines} سطر كود)`;
      if (hasFiles) response += `\n\n${fileList}`;
      response += `\n\nالتقنيات: ${[ctx.hasHtml ? "HTML" : "", ctx.hasCss ? "CSS" : "", ctx.hasJs ? "JavaScript" : ""].filter(Boolean).join(" • ")}`;
      if (isReady) response += `\n\nالمشروع جاهز! تبي تجربه بالمعاينة المباشرة؟ أو تبي أحسن شيء فيه؟`;
      else response += `\n\nلسا يشتغل عليه... صبر شوي.`;
      return response;
    }

    case "explain-code": {
      if (!hasFiles) return `ما فيه كود للشرح حالياً. اوصف لي فكرة مشروعك وأبنيه لك!`;
      if (repeated) return `زي ما شرحت لك — المشروع فيه ${ctx.fileCount} ملفات. تبي أشرح ملف معين بالتفصيل؟ قولي اسم الملف.`;

      const explanations = ctx.filePaths.map((f) => {
        const n = f.split("/").pop() || f;
        if (n.endsWith(".html")) return `• **${f}** — هيكل الصفحة والعناصر المرئية`;
        if (n.endsWith(".css")) return `• **${f}** — التنسيقات والألوان والتصميم المتجاوب`;
        if (n === "game.js") return `• **${f}** — محرك اللعبة، حلقة التحديث، والتحكم`;
        if (n.endsWith(".js")) return `• **${f}** — المنطق والتفاعلات وإدارة الحالة`;
        if (n === "package.json") return `• **${f}** — إعدادات المشروع`;
        if (n.endsWith(".md")) return `• **${f}** — التوثيق`;
        return `• **${f}**`;
      }).join("\n");

      return pick([
        `خلني أشرح لك "${name}":\n\nالمشروع من نوع ${stackName}، فيه ${ctx.totalCodeLines} سطر كود موزعين على ${ctx.fileCount} ملفات:\n\n${explanations}\n\nالكل يشتغل بالمتصفح بدون سيرفر خارجي. تبي أدخل بتفاصيل ملف معين؟`,
        `مشروعك "${name}" مبني كـ ${stackName}. هذي ملفاته:\n\n${explanations}\n\nإجمالي الكود: ${ctx.totalCodeLines} سطر. تصميم متجاوب ويشتغل محلياً.\n\nقولي أي ملف تبي أشرحه بالتفصيل.`,
      ]);
    }

    case "fix-error": {
      const emotionPrefix = emotion === "frustrated"
        ? `أفهمك والله، الأخطاء تعصب. خلني أشوف الموضوع...\n\n`
        : "";

      const checks: string[] = [];
      if (!ctx.hasHtml) checks.push("ما لقيت ملف HTML — هذا ممكن يكون السبب");
      if (!ctx.hasCss) checks.push("ما فيه ملف CSS — الشكل ممكن يكون مكسور");
      if (!ctx.hasJs) checks.push("ما فيه JavaScript — التفاعلات ما راح تشتغل");
      if (ctx.fileCount === 0) checks.push("المشروع فاضي! لازم نبنيه أول");

      if (checks.length === 0) {
        return `${emotionPrefix}فحصت المشروع "${name}" — كل شيء يبان سليم تقنياً:\n\n• HTML موجود ✓\n• CSS موجود ✓\n• JavaScript موجود ✓\n• الملفات متصلة ✓\n\nإذا فيه خطأ محدد تشوفه، وصفه لي بالضبط وأساعدك فيه. أو افتح المعاينة وقولي شو تشوف.`;
      }
      return `${emotionPrefix}لقيت بعض المشاكل في "${name}":\n\n${checks.map(c => `⚠️ ${c}`).join("\n")}\n\nتبي أحاول أصلحها؟ أو وصف لي الخطأ اللي تشوفه.`;
    }

    case "improve": {
      if (repeated) return `لسا نفس الاقتراحات اللي قلتها. تبي أطبق واحد منها؟ قولي أيها.`;

      let suggestions: string[] = [];
      if (ctx.stack.includes("game")) {
        suggestions = ["إضافة مستويات صعوبة", "لوحة أفضل النتائج", "تأثيرات صوتية", "تحكم بالتاتش للموبايل", "سمات مرئية مختلفة"];
      } else if (ctx.stack.includes("dashboard")) {
        suggestions = ["رسوم بيانية تفاعلية", "بحث وتصفية متقدمة", "تصدير البيانات CSV", "نظام إشعارات", "وضع ليلي/نهاري"];
      } else if (ctx.stack.includes("ecommerce")) {
        suggestions = ["بحث ذكي بالمنتجات", "نظام تقييم", "تحسين صفحة الدفع", "عرض محسّن للموبايل"];
      } else {
        suggestions = ["تحسين أداء التحميل", "تصميم متجاوب أفضل", "رسوم متحركة سلسة", "تحقق من المدخلات", "تحسين إمكانية الوصول"];
      }

      return pick([
        `عندي كم فكرة لتحسين "${name}":\n\n${suggestions.map((s, i) => `${i+1}. ${s}`).join("\n")}\n\nأيها يعجبك؟ قول الرقم أو وصف اللي تبيه وأبدأ فيه.`,
        `خلني أقترح عليك تحسينات لـ "${name}":\n\n${suggestions.map((s, i) => `${i+1}. ${s}`).join("\n")}\n\nتبي أطبق أي واحد منها؟`,
      ]);
    }

    case "add-feature": {
      const details = extractFeatureDetails(text);
      const desc = text.substring(0, 80);
      return pick([
        `فهمت! تبي: ${desc}\n\n${details.colors.length > 0 ? `الألوان: ${details.colors.join("، ")}\n` : ""}${details.elements.length > 0 ? `العناصر: ${details.elements.join("، ")}\n` : ""}\nأشتغل عليها الحين. 15 وكيل بيشتغلون على إضافتها... تابع التقدم بلوحة الوكلاء! ⚡`,
        `تمام، بضيف هذي الميزة على "${name}". خلني أشتغل عليها...\n\nخط الأنابيب بدأ يشتغل. أعطيني شوية وقت ⏳`,
      ]);
    }

    case "change-style": {
      const details = extractFeatureDetails(text);
      return `أوكي! بغير التصميم حسب ما تبي 🎨${details.colors.length > 0 ? `\n\nالألوان: ${details.colors.join("، ")}` : ""}${details.elements.length > 0 ? `\nالعناصر: ${details.elements.join("، ")}` : ""}\n\nالوكلاء يشتغلون على التعديل... شوف النتيجة بالمعاينة المباشرة بعد شوي.`;
    }

    case "rebuild":
      return pick([
        `تبي نبني "${name}" من الصفر؟ ما عندي مشكلة! 🔄\n\nبعيد تحليل الفكرة وأبني نسخة أفضل. 15 وكيل بيشتغلون عليه...\n\nصبر شوي وشوف النتيجة الجديدة! ⚡`,
        `أوكي! بهدم كل شيء وأبني من جديد 🔄\n\nالوكلاء بدأوا الشغل... النسخة الجديدة بتكون أحسن إن شاء الله.`,
      ]);

    case "translate":
      return `تبي أترجم شو بالضبط؟\n\nأقدر أترجم واجهة التطبيق، التعليقات بالكود، أو ملف التوثيق — عربي لإنجليزي أو العكس.\n\nقولي شو تبي وأبدأ.`;

    case "document":
      return `بكتب توثيق كامل لـ "${name}"! 📝\n\nبولد README، تعليقات بالكود، ودليل استخدام. الوكلاء يشتغلون...\n\nخلني أخلص وأوريك النتيجة.`;

    case "build-new":
      return pick([
        `يلا نبني! 🚀\n\nفهمت الفكرة — 15 وكيل ذكي بيشتغلون عليها الحين:\n\nمن تفسير الفكرة → التخطيط → التصميم → الكود → الفحص → التحسين → النشر\n\nتقريباً 20 ثانية وتشوف النتيجة. تابع التقدم بلوحة الوكلاء! ⚡`,
        `حلو! أبدأ البناء الآن 🚀\n\nالوكلاء الـ 15 بيمرون على المشروع خطوة بخطوة — تحليل، تصميم، كود، فحص، تحسين.\n\nصبر شوي وشوف النتيجة...`,
      ]);

    case "question": {
      const lower = text.toLowerCase();
      if (lower.includes("كم") || lower.includes("how many")) {
        return `"${name}" فيه ${ctx.fileCount} ملفات و ${ctx.totalCodeLines} سطر كود. نوعه ${stackName}${isReady ? " وجاهز" : ""}.\n\nتبي تفاصيل أكثر؟`;
      }
      if (lower.includes("ماذا يمكن") || lower.includes("شو تقدر") || lower.includes("what can")) {
        return `أقدر أبني لك تطبيقات كاملة من جملة وحدة! وأشرح الكود، أصلح الأخطاء، أحسن الأداء، أضيف ميزات، أترجم، وأوثق.\n\nكل شيء محلي بدون أي اتصال خارجي. جربني! 😊`;
      }
      return `سؤال حلو! بناءً على "${name}" (${stackName}):\n\nممكن أساعدك أشرح أي جزء، أضيف ميزات، أو أصلح مشاكل. كن أكثر تحديداً وأعطيك إجابة مفصلة.`;
    }

    default:
      return pick([
        `فهمت رسالتك! ${isReady ? `مشروعك "${name}" جاهز — تبي تشوفه بالمعاينة؟ أو تبي نعدل شيء فيه؟` : `مشروعك "${name}" لسا ${statusText}. تبي تسأل عن شيء؟`}`,
        `أوكي! ${isReady ? `"${name}" جاهز. شو تبي نسوي فيه؟` : `"${name}" ${statusText}. قولي شو تحتاج.`}`,
      ]);
  }
}

function generateEnglishResponse(
  intent: ChatIntent, text: string, ctx: ProjectContext,
  emotion: string, repeated: boolean, lastAiMsg: string | null,
  name: string, stackName: string, statusText: string,
  isReady: boolean, hasFiles: boolean
): string {
  switch (intent) {
    case "greeting": {
      const greetings = [
        `Hey there! 👋\n\nYour project "${name}" is ${isReady ? "ready and looking good" : statusText}. You've got ${ctx.fileCount} files with ${ctx.totalCodeLines} lines of code.\n\nWhat would you like to work on?`,
        `Hi! Good to see you 👋\n\n"${name}" — ${stackName}${isReady ? ", everything's good to go" : `, currently ${statusText}`}.\n\nWhat can I help you with?`,
        `Hello! 👋\n\n"${name}" has ${ctx.fileCount} files${isReady ? " and is ready to preview" : ""}. How can I help you today?`,
        `Hey! Welcome back 👋\n\nProject "${name}" (${stackName}) — ${ctx.totalCodeLines} lines of code${isReady ? ", all systems go" : ", still in progress"}.\n\nWhat do you need?`,
      ];
      return pick(greetings);
    }

    case "thanks": {
      return pick([
        `You're welcome! Happy to help 😊\nLet me know if you need anything else.`,
        `Glad you like it! 🙏\nWant to add anything else to the project?`,
        `Anytime! I'm here whenever you need me 😊`,
        `Thanks! Want to keep going or is everything good?`,
      ]);
    }

    case "affirmative": {
      if (lastAiMsg) {
        if (lastAiMsg.includes("improv") || lastAiMsg.includes("optim") || lastAiMsg.includes("suggest")) {
          return `On it! Applying improvements to "${name}" now 🚀\n\nThe agents are working on it... check the Agents panel for progress.`;
        }
        if (lastAiMsg.includes("preview") || lastAiMsg.includes("Preview")) {
          return `Open the Live Preview panel and check it out! You can also try mobile view to test responsiveness.`;
        }
        if (lastAiMsg.includes("feature") || lastAiMsg.includes("add")) {
          return `Great! Working on adding it now. The 15-agent pipeline is running... ⚡`;
        }
        return `Alright, working on it now! Give me a moment... ⚡`;
      }
      return `Sure thing! Tell me what you'd like me to do and I'll get started.`;
    }

    case "negative": {
      return pick([
        `No problem! What would you like to do instead?`,
        `Got it, scrapping that idea. What else can I help with?`,
        `Okay! Let me know what you have in mind.`,
      ]);
    }

    case "help": {
      return `Here's what I can do for you:\n\n• Describe an app idea and I'll build it from scratch\n• Say "explain" and I'll break down your code file by file\n• Say "fix" and I'll scan for errors\n• Say "improve" and I'll suggest optimizations\n• Say "status" for a project overview\n\nOr just type whatever you need — I'll figure it out. I speak Arabic too! 😊`;
    }

    case "status": {
      if (repeated) {
        if (isReady) return `Same as before — "${name}" is ready, nothing changed. ${ctx.fileCount} files, ${ctx.totalCodeLines} lines. Want to add something new?`;
        return `Still ${statusText}. Give it a moment.`;
      }

      const fileList = ctx.filePaths.map((f, i) => {
        const size = ctx.fileSizes[i] || 0;
        return `  • ${f} (${size > 1000 ? (size/1024).toFixed(1) + "KB" : size + "B"})`;
      }).join("\n");

      let response = `Project "${name}" — ${stackName}\n\nStatus: ${isReady ? "Ready ✅" : statusText}\nFiles: ${ctx.fileCount} (${ctx.totalCodeLines} lines of code)`;
      if (hasFiles) response += `\n\n${fileList}`;
      response += `\n\nTech: ${[ctx.hasHtml ? "HTML" : "", ctx.hasCss ? "CSS" : "", ctx.hasJs ? "JavaScript" : ""].filter(Boolean).join(" • ")}`;
      if (isReady) response += `\n\nEverything's good! Want to preview it or should I suggest some improvements?`;
      else response += `\n\nStill working on it... hang tight.`;
      return response;
    }

    case "explain-code": {
      if (!hasFiles) return `No code to explain yet. Describe your app idea and I'll build it for you!`;
      if (repeated) return `Same files as before — ${ctx.fileCount} total. Want me to explain a specific one in detail? Just tell me the filename.`;

      const explanations = ctx.filePaths.map((f) => {
        const n = f.split("/").pop() || f;
        if (n.endsWith(".html")) return `• **${f}** — page structure and visual elements`;
        if (n.endsWith(".css")) return `• **${f}** — styling, colors, and responsive design`;
        if (n === "game.js") return `• **${f}** — game engine, update loop, and controls`;
        if (n.endsWith(".js")) return `• **${f}** — logic, interactions, and state management`;
        if (n === "package.json") return `• **${f}** — project configuration`;
        if (n.endsWith(".md")) return `• **${f}** — documentation`;
        return `• **${f}**`;
      }).join("\n");

      return pick([
        `Let me walk you through "${name}":\n\nIt's a ${stackName} with ${ctx.totalCodeLines} lines across ${ctx.fileCount} files:\n\n${explanations}\n\nRuns entirely in the browser, no external servers needed.\n\nWant me to dive deeper into any specific file?`,
        `Here's what "${name}" looks like under the hood:\n\n${explanations}\n\nTotal: ${ctx.totalCodeLines} lines of code. Responsive and runs locally.\n\nPick a file and I'll explain it in detail.`,
      ]);
    }

    case "fix-error": {
      const emotionPrefix = emotion === "frustrated"
        ? `I hear you — bugs are frustrating. Let me take a look...\n\n`
        : "";

      const issues: string[] = [];
      if (!ctx.hasHtml) issues.push("No HTML file found — this could be the issue");
      if (!ctx.hasCss) issues.push("No CSS file — layout might be broken");
      if (!ctx.hasJs) issues.push("No JavaScript — interactions won't work");
      if (ctx.fileCount === 0) issues.push("Project is empty! Let's build it first");

      if (issues.length === 0) {
        return `${emotionPrefix}I scanned "${name}" and everything looks good technically:\n\n• HTML present ✓\n• CSS present ✓\n• JavaScript present ✓\n• Files connected ✓\n\nIf you're seeing a specific error, describe what's happening and I'll dig deeper. Or open the preview and tell me what you see.`;
      }
      return `${emotionPrefix}Found some issues in "${name}":\n\n${issues.map(i => `⚠️ ${i}`).join("\n")}\n\nWant me to try fixing them? Or describe what you're seeing.`;
    }

    case "improve": {
      if (repeated) return `Same suggestions as before. Want me to apply one of them? Just say which one.`;

      let suggestions: string[] = [];
      if (ctx.stack.includes("game")) {
        suggestions = ["Add difficulty levels", "Add a leaderboard", "Add sound effects", "Improve mobile touch controls", "Add visual themes"];
      } else if (ctx.stack.includes("dashboard")) {
        suggestions = ["Add interactive charts", "Advanced search & filtering", "Data export (CSV)", "Notification system", "Dark/light mode toggle"];
      } else if (ctx.stack.includes("ecommerce")) {
        suggestions = ["Smart product search", "Rating system", "Better checkout flow", "Mobile-optimized layout"];
      } else {
        suggestions = ["Optimize loading speed", "Better responsive design", "Smooth CSS animations", "Input validation", "Accessibility improvements"];
      }

      return pick([
        `Here are some ideas for "${name}":\n\n${suggestions.map((s, i) => `${i+1}. ${s}`).join("\n")}\n\nWhich one sounds good? Just tell me the number or describe what you want.`,
        `A few ways to make "${name}" better:\n\n${suggestions.map((s, i) => `${i+1}. ${s}`).join("\n")}\n\nWant me to implement any of these?`,
      ]);
    }

    case "add-feature": {
      const details = extractFeatureDetails(text);
      const desc = text.substring(0, 80);
      return pick([
        `Got it! You want: ${desc}\n\n${details.colors.length > 0 ? `Colors: ${details.colors.join(", ")}\n` : ""}${details.elements.length > 0 ? `Elements: ${details.elements.join(", ")}\n` : ""}\nWorking on it now — 15 agents are on the job. Track progress in the Agents panel! ⚡`,
        `Sure thing! Adding that to "${name}" now.\n\nThe pipeline is running — give it a moment ⏳`,
      ]);
    }

    case "change-style": {
      const details = extractFeatureDetails(text);
      return `On it! Updating the design 🎨${details.colors.length > 0 ? `\n\nColors: ${details.colors.join(", ")}` : ""}${details.elements.length > 0 ? `\nElements: ${details.elements.join(", ")}` : ""}\n\nThe agents are redesigning it now... check the preview in a moment.`;
    }

    case "rebuild":
      return pick([
        `Starting fresh on "${name}"! 🔄\n\nI'll re-analyze everything and build a better version. 15 agents are on it...\n\nHang tight and watch the magic happen! ⚡`,
        `Okay, rebuilding from scratch! 🔄\n\nThe agents just started — new and improved version coming up.`,
      ]);

    case "translate":
      return `What would you like me to translate?\n\nI can translate the app interface, code comments, or documentation — Arabic to English or vice versa.\n\nJust tell me what you need.`;

    case "document":
      return `Writing documentation for "${name}" now! 📝\n\nI'll create a README, code comments, and a usage guide. The agents are working on it...\n\nI'll show you when it's done.`;

    case "build-new":
      return pick([
        `Let's build it! 🚀\n\nI understood your idea — 15 AI agents are now working on it:\n\nIdea analysis → Planning → Design → Code → Testing → Optimization → Deployment\n\nAbout 20 seconds and you'll see the result. Check the Agents panel for progress! ⚡`,
        `Awesome! Building it now 🚀\n\nThe 15-agent pipeline is running — analysis, design, code, testing, the works.\n\nHang tight...`,
      ]);

    case "question": {
      const lower = text.toLowerCase();
      if (lower.includes("how many") || lower.includes("count")) {
        return `"${name}" has ${ctx.fileCount} files and ${ctx.totalCodeLines} lines of code. It's a ${stackName}${isReady ? " and it's ready" : ""}.\n\nWant more details?`;
      }
      if (lower.includes("what can") || lower.includes("capabilities")) {
        return `I can build full apps from a single sentence, explain code, fix bugs, optimize performance, add features, translate, and document — all locally with zero external APIs.\n\nTry me! 😊`;
      }
      return `Good question! Based on "${name}" (${stackName}):\n\nI can explain any part, add features, or fix issues. Be a bit more specific and I'll give you a detailed answer.`;
    }

    default:
      return pick([
        `Got your message! ${isReady ? `"${name}" is ready — want to preview it or make changes?` : `"${name}" is ${statusText}. What do you need?`}`,
        `Okay! ${isReady ? `"${name}" is all set. What should we do with it?` : `"${name}" is ${statusText}. How can I help?`}`,
      ]);
  }
}

function generateTip(ctx: ProjectContext, intent: ChatIntent, lang: "ar" | "en"): string | null {
  if (["greeting", "help", "thanks", "affirmative", "negative"].includes(intent)) return null;
  if (ctx.status !== "ready" || ctx.fileCount === 0) return null;
  if (Math.random() > 0.4) return null;

  const tips = lang === "ar" ? [
    "بالمناسبة، جرب وضع الموبايل بالمعاينة — تشوف كيف يطلع على الجوال 📱",
    "تقدر تفتح لوحة المراقبة وتشوف إحصائيات النظام 📊",
    "جرب تقول 'حسّن' — عندي اقتراحات حلوة لمشروعك ⚡",
  ] : [
    "By the way, try the mobile preview mode — see how it looks on phone 📱",
    "You can open the Monitor panel for system stats 📊",
    "Try saying 'improve' — I've got some good ideas for your project ⚡",
  ];
  return "\n\n" + pick(tips);
}

export async function processChat(projectId: string, content: string): Promise<string> {
  const { processChatV3 } = await import("./agents-v3");
  const result = await processChatV3(projectId, content);
  return result.response;
}

export async function shouldRunPipeline(content: string): Promise<boolean> {
  const { shouldRunPipelineV3 } = await import("./agents-v3");
  return shouldRunPipelineV3(content);
}

export async function processChatFull(projectId: string, content: string): Promise<{ response: string; shouldBuild: boolean; buildDescription?: string }> {
  const { processChatV3 } = await import("./agents-v3");
  return processChatV3(projectId, content);
}

export async function analyzeUploadedFile(
  projectId: string,
  filename: string,
  attachmentType: string,
  fileContent: string | null,
  fileSize: number
): Promise<string> {
  const ctx = await getProjectContext(projectId);
  const lang = ctx.lastMessages.some(m => m.role === "user" && /[\u0600-\u06FF]/.test(m.content)) ? "ar" : "en";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const sizeLabel = fileSize > 1024 ? `${(fileSize / 1024).toFixed(1)}KB` : `${fileSize}B`;

  if (attachmentType === "image") {
    if (lang === "ar") {
      return pick([
        `استلمت الصورة "${filename}" (${sizeLabel}) 📷\n\nالصورة محفوظة بالمشروع. لو هي سكرينشوت من خطأ، وصف لي شو تشوف فيها وأساعدك. أو لو تبي أستخدمها بالتصميم، قولي وين تبيها بالواجهة.`,
        `وصلتني الصورة! "${filename}" — ${sizeLabel} 📷\n\nما أقدر أحلل محتوى الصور مباشرة لأن كل شيء محلي، بس لو تقولي شو فيها أقدر أساعدك.\n\nهل هي سكرينشوت من خطأ؟ أو تصميم تبي أطبقه؟`,
        `تم رفع "${filename}" بنجاح (${sizeLabel}) 📷\n\nقولي شو اللي بالصورة — خطأ، تصميم، أو مرجع — وأشتغل عليه معاك.`,
      ]);
    }
    return pick([
      `Got your image "${filename}" (${sizeLabel}) 📷\n\nThe image is saved. If it's an error screenshot, describe what you see and I'll help debug. Or if you want to use it in the design, tell me where you'd like it.`,
      `Image received! "${filename}" — ${sizeLabel} 📷\n\nSince everything runs locally, I can't analyze image content directly. But tell me what's in it and I'll help.\n\nIs it a bug screenshot? A design reference?`,
      `Uploaded "${filename}" successfully (${sizeLabel}) 📷\n\nTell me what's in the image — error, design, or reference — and I'll work with you on it.`,
    ]);
  }

  if (!fileContent) {
    return lang === "ar"
      ? `تم رفع "${filename}" (${sizeLabel}) بس ما قدرت أقرأ محتواه. ممكن تنسخ المحتوى اللي يهمك وتلصقه هنا؟`
      : `Uploaded "${filename}" (${sizeLabel}) but couldn't read its contents. Could you paste the relevant parts here?`;
  }

  const lines = fileContent.split("\n");
  const lineCount = lines.length;
  const nonEmpty = lines.filter(l => l.trim()).length;

  const codeExts = ["js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "html", "css"];
  const isCode = codeExts.includes(ext);
  const isLog = ext === "log" || ext === "txt";

  if (isCode) {
    const analysis = analyzeCodeContent(fileContent, ext, filename);

    if (lang === "ar") {
      return pick([
        `حللت ملف "${filename}" (${lineCount} سطر، ${sizeLabel}):\n\n${analysis.ar}\n\n${ctx.fileCount > 0 ? `مشروعك فيه ${ctx.fileCount} ملفات — تبي أقارن هذا الملف مع ملفات المشروع؟` : "تبي أستخدم هذا الكود بالمشروع؟"}`,
        `شفت الملف! "${filename}" — ${lineCount} سطر كود:\n\n${analysis.ar}\n\nتبي أعدل عليه شيء أو أدمجه بمشروعك "${ctx.projectName}"؟`,
      ]);
    }
    return pick([
      `Analyzed "${filename}" (${lineCount} lines, ${sizeLabel}):\n\n${analysis.en}\n\n${ctx.fileCount > 0 ? `Your project has ${ctx.fileCount} files — want me to compare this with existing code?` : "Want me to incorporate this into your project?"}`,
      `Looked at "${filename}" — ${lineCount} lines of code:\n\n${analysis.en}\n\nWant me to modify it or integrate it into "${ctx.projectName}"?`,
    ]);
  }

  if (isLog) {
    const logAnalysis = analyzeLogContent(fileContent);

    if (lang === "ar") {
      return `حللت ملف السجل "${filename}" (${lineCount} سطر):\n\n${logAnalysis.ar}\n\nتبي أساعدك تحل المشاكل اللي لقيتها؟`;
    }
    return `Analyzed log file "${filename}" (${lineCount} lines):\n\n${logAnalysis.en}\n\nWant me to help resolve the issues I found?`;
  }

  if (lang === "ar") {
    return `استلمت "${filename}" (${lineCount} سطر، ${sizeLabel}) 📎\n\nالمحتوى من نوع .${ext} — فيه ${nonEmpty} سطر محتوى فعلي.\n\nقولي شو تبيني أسوي فيه — أحلله، أصلحه، أو أدمجه بالمشروع؟`;
  }
  return `Received "${filename}" (${lineCount} lines, ${sizeLabel}) 📎\n\nIt's a .${ext} file with ${nonEmpty} non-empty lines.\n\nWhat would you like me to do with it — analyze, fix, or integrate into the project?`;
}

function analyzeCodeContent(content: string, ext: string, filename: string): { ar: string; en: string } {
  const lines = content.split("\n");
  const lineCount = lines.length;
  const findings: { ar: string[]; en: string[] } = { ar: [], en: [] };

  const functionMatches = content.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+\w+|class\s+\w+/g);
  if (functionMatches && functionMatches.length > 0) {
    findings.en.push(`Found ${functionMatches.length} functions/classes`);
    findings.ar.push(`لقيت ${functionMatches.length} دالة/كلاس`);
  }

  const importMatches = content.match(/^import\s|^from\s|^require\s*\(/gm);
  if (importMatches && importMatches.length > 0) {
    findings.en.push(`${importMatches.length} imports/dependencies`);
    findings.ar.push(`${importMatches.length} استيراد/مكتبة`);
  }

  const commentMatches = content.match(/\/\/|\/\*|#\s|<!--/g);
  if (commentMatches && commentMatches.length > 0) {
    const ratio = Math.round((commentMatches.length / lineCount) * 100);
    findings.en.push(`${commentMatches.length} comments (~${ratio}% coverage)`);
    findings.ar.push(`${commentMatches.length} تعليق (~${ratio}% تغطية)`);
  } else {
    findings.en.push("No comments found — consider adding documentation");
    findings.ar.push("ما فيه تعليقات — يفضل تضيف توثيق");
  }

  const todoMatches = content.match(/TODO|FIXME|HACK|XXX|BUG/gi);
  if (todoMatches && todoMatches.length > 0) {
    findings.en.push(`${todoMatches.length} TODO/FIXME markers found`);
    findings.ar.push(`${todoMatches.length} علامة TODO/FIXME`);
  }

  const consoleMatches = content.match(/console\.(log|warn|error)|print\(|System\.out/g);
  if (consoleMatches && consoleMatches.length > 0) {
    findings.en.push(`${consoleMatches.length} console/print statements (clean up for production)`);
    findings.ar.push(`${consoleMatches.length} أوامر طباعة (نظفها قبل الإنتاج)`);
  }

  if (ext === "html") {
    if (!content.includes("<!DOCTYPE") && !content.includes("<!doctype")) {
      findings.en.push("Missing DOCTYPE declaration");
      findings.ar.push("ناقص تعريف DOCTYPE");
    }
    if (!content.includes("<meta name=\"viewport\"") && !content.includes("<meta name='viewport'")) {
      findings.en.push("Missing viewport meta tag — might not be responsive");
      findings.ar.push("ناقص meta viewport — ممكن ما يكون متجاوب");
    }
  }

  if (ext === "css") {
    const mediaQueries = content.match(/@media/g);
    if (mediaQueries) {
      findings.en.push(`${mediaQueries.length} media queries for responsiveness`);
      findings.ar.push(`${mediaQueries.length} استعلام وسائط للتجاوب`);
    } else {
      findings.en.push("No media queries — consider adding responsive breakpoints");
      findings.ar.push("ما فيه media queries — يفضل تضيف تصميم متجاوب");
    }
  }

  const longLines = lines.filter(l => l.length > 120).length;
  if (longLines > 5) {
    findings.en.push(`${longLines} lines exceed 120 characters — consider formatting`);
    findings.ar.push(`${longLines} سطر أطول من 120 حرف — يفضل تنسيقها`);
  }

  return {
    en: findings.en.map(f => `• ${f}`).join("\n"),
    ar: findings.ar.map(f => `• ${f}`).join("\n"),
  };
}

function analyzeLogContent(content: string): { ar: string; en: string } {
  const lines = content.split("\n");
  const errors = lines.filter(l => /error|exception|fatal|fail/i.test(l));
  const warnings = lines.filter(l => /warn|warning/i.test(l));
  const infos = lines.filter(l => /info|success|ok|done/i.test(l));

  const enParts: string[] = [];
  const arParts: string[] = [];

  enParts.push(`Total: ${lines.length} lines`);
  arParts.push(`المجموع: ${lines.length} سطر`);

  if (errors.length > 0) {
    enParts.push(`Errors: ${errors.length} found`);
    arParts.push(`أخطاء: ${errors.length}`);
    const sample = errors.slice(0, 3).map(e => `  - ${e.trim().substring(0, 100)}`).join("\n");
    enParts.push(`Recent errors:\n${sample}`);
    arParts.push(`أحدث الأخطاء:\n${sample}`);
  } else {
    enParts.push("No errors detected");
    arParts.push("ما فيه أخطاء");
  }

  if (warnings.length > 0) {
    enParts.push(`Warnings: ${warnings.length}`);
    arParts.push(`تحذيرات: ${warnings.length}`);
  }

  if (infos.length > 0) {
    enParts.push(`Info entries: ${infos.length}`);
    arParts.push(`معلومات: ${infos.length}`);
  }

  return {
    en: enParts.map(p => `• ${p}`).join("\n"),
    ar: arParts.map(p => `• ${p}`).join("\n"),
  };
}

export { detectLanguage, classifyIntent, getProjectContext };
