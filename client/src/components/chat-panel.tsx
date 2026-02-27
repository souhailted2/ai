import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage } from "@shared/schema";
import {
  Send, Bot, User, Eye, Search, Cpu, Palette, Server, Layout,
  Bug, TestTube2, Zap, Shield, FileText, Brain, Rocket, Activity, Sparkles,
  Paperclip, Image as ImageIcon, X, FileCode, File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const agentIcons: Record<string, typeof Bot> = {
  assistant: Sparkles, vision: Eye, planner: Search, architect: Cpu,
  "ui-designer": Palette, backend: Server, frontend: Layout, developer: Bot,
  debugger: Bug, tester: TestTube2, optimizer: Zap, security: Shield,
  docs: FileText, memory: Brain, deployer: Rocket, monitor: Activity,
};

const agentColors: Record<string, string> = {
  assistant: "bg-primary/15 text-primary",
  vision: "bg-violet-500/15 text-violet-500",
  planner: "bg-amber-500/15 text-amber-500",
  architect: "bg-blue-500/15 text-blue-500",
  "ui-designer": "bg-pink-500/15 text-pink-500",
  backend: "bg-orange-500/15 text-orange-500",
  frontend: "bg-sky-500/15 text-sky-500",
  developer: "bg-purple-500/15 text-purple-500",
  debugger: "bg-red-500/15 text-red-500",
  tester: "bg-teal-500/15 text-teal-500",
  optimizer: "bg-cyan-500/15 text-cyan-500",
  security: "bg-rose-500/15 text-rose-500",
  docs: "bg-emerald-500/15 text-emerald-500",
  memory: "bg-indigo-500/15 text-indigo-500",
  deployer: "bg-green-500/15 text-green-500",
  monitor: "bg-lime-500/15 text-lime-500",
};

const agentLabels: Record<string, { ar: string; en: string }> = {
  assistant: { ar: "المساعد الذكي", en: "AI Assistant" },
  vision: { ar: "وكيل الرؤية", en: "Vision Agent" },
  planner: { ar: "وكيل التخطيط", en: "Planner Agent" },
  architect: { ar: "وكيل البنية", en: "Architect Agent" },
  "ui-designer": { ar: "وكيل التصميم", en: "UI Designer" },
  backend: { ar: "مهندس الخلفية", en: "Backend Engineer" },
  frontend: { ar: "مهندس الواجهة", en: "Frontend Engineer" },
  developer: { ar: "وكيل التطوير", en: "Developer Agent" },
  debugger: { ar: "وكيل التصحيح", en: "Debug Agent" },
  tester: { ar: "وكيل الاختبار", en: "Test Agent" },
  optimizer: { ar: "وكيل التحسين", en: "Optimizer Agent" },
  security: { ar: "وكيل الأمان", en: "Security Agent" },
  docs: { ar: "وكيل التوثيق", en: "Docs Agent" },
  memory: { ar: "وكيل الذاكرة", en: "Memory Agent" },
  deployer: { ar: "وكيل النشر", en: "Deploy Agent" },
  monitor: { ar: "وكيل المراقبة", en: "Monitor Agent" },
};

const quickCommands = [
  { label: "What's the status?", labelAr: "شو الحالة؟", command: "status", commandAr: "الحالة", icon: "📊" },
  { label: "Explain the code", labelAr: "اشرح الكود", command: "explain", commandAr: "اشرح", icon: "🔍" },
  { label: "How can I improve?", labelAr: "كيف أحسّن؟", command: "improve", commandAr: "حسّن", icon: "⚡" },
  { label: "I need help", labelAr: "أحتاج مساعدة", command: "help", commandAr: "مساعدة", icon: "💬" },
];

const IMAGE_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp";
const FILE_EXTENSIONS = ".js,.ts,.jsx,.tsx,.css,.json,.txt,.md,.log,.py,.java,.c,.cpp,.xml,.yaml,.yml";

interface ChatPanelProps {
  projectId: string;
  messages: ChatMessage[];
}

export function ChatPanel({ projectId, messages }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const userLangArabic = messages.some(m => m.role === "user" && /[\u0600-\u06FF]/.test(m.content));

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/chat`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/chat/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "activities"] });
    },
    onError: () => {
      toast({
        title: userLangArabic ? "فشل رفع الملف" : "Upload failed",
        description: userLangArabic ? "نوع الملف غير مدعوم أو الملف كبير جداً (الحد 5MB)" : "File type not supported or file too large (max 5MB)",
        variant: "destructive",
      });
    },
  });

  const isUploading = uploadMutation.isPending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending, isUploading]);

  const handleSend = (content?: string) => {
    const trimmed = (content || input).trim();
    if (!trimmed || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !isUploading && !sendMutation.isPending) {
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col flex-1 min-w-0" data-testid="chat-panel">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">AI Assistant</span>
        <span className="text-[11px] text-muted-foreground ml-auto">{messages.length} messages</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1" data-testid="text-welcome-title">15 AI Agents Ready</p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4" data-testid="text-welcome-desc">
                Describe what you want to build in Arabic or English. The AI agents will automatically plan, design, code, test, and deploy your project.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {quickCommands.map((cmd) => (
                  <button
                    key={cmd.command}
                    onClick={() => handleSend(userLangArabic ? cmd.commandAr : cmd.command)}
                    disabled={sendMutation.isPending}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`button-quick-${cmd.command}`}
                  >
                    {cmd.icon} {userLangArabic ? cmd.labelAr : cmd.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
          {(sendMutation.isPending || isUploading) && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              </div>
              <div className="flex-1 pt-1">
                <span className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  {userLangArabic ? "المساعد الذكي" : "AI Assistant"}
                </span>
                <div className="inline-flex items-center gap-1.5 bg-card border border-card-border rounded-lg px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-xs text-muted-foreground ml-1">
                    {isUploading
                      ? (userLangArabic ? "يحلل الملف..." : "Analyzing file...")
                      : (userLangArabic ? "يفكر..." : "Thinking...")}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {messages.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border flex gap-1.5 overflow-x-auto">
          {quickCommands.map((cmd) => (
            <button
              key={cmd.command}
              onClick={() => handleSend(userLangArabic ? cmd.commandAr : cmd.command)}
              disabled={sendMutation.isPending}
              className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap flex-shrink-0"
              data-testid={`button-quick-bar-${cmd.command}`}
            >
              {cmd.icon} {userLangArabic ? cmd.labelAr : cmd.label}
            </button>
          ))}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={FILE_EXTENSIONS}
        className="hidden"
        data-testid="input-file-upload"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileSelect}
        accept={IMAGE_EXTENSIONS}
        className="hidden"
        data-testid="input-image-upload"
      />

      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2 bg-card rounded-lg border border-card-border p-2">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || sendMutation.isPending}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title={userLangArabic ? "رفع ملف" : "Upload file"}
              data-testid="button-upload-file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading || sendMutation.isPending}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title={userLangArabic ? "رفع صورة" : "Upload image"}
              data-testid="button-upload-image"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={userLangArabic ? "اكتب رسالتك هنا..." : "Type your message..."}
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[36px] max-h-[120px] py-1.5 px-2"
            data-testid="input-chat"
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={!input.trim() || sendMutation.isPending}
            data-testid="button-send-chat"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function renderFormattedText(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

function FormattedContent({ content }: { content: string }) {
  const arabic = isArabic(content);
  const lines = content.split("\n");

  return (
    <div className={`space-y-1 ${arabic ? "text-right" : "text-left"}`} dir={arabic ? "rtl" : "ltr"}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (trimmed === "") return <div key={i} className="h-1" />;

        if (/^[•\-]\s/.test(trimmed) || /^[⚡⚠️✓✅❌📱🎨🔍📊📝📦🎮🏆🔊💬🔔🌙💳⭐♿🔒📷📎]\s/.test(trimmed) || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s/u.test(trimmed)) {
          return (
            <div key={i} className="text-sm leading-relaxed flex items-start gap-1.5">
              <span className="flex-shrink-0 opacity-80">{trimmed.split(" ")[0]}</span>
              <span>{renderFormattedText(trimmed.substring(trimmed.indexOf(" ") + 1))}</span>
            </div>
          );
        }

        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <div key={i} className="text-sm leading-relaxed flex items-start gap-1.5">
              <span className="flex-shrink-0 text-muted-foreground font-medium min-w-[1.2em]">{trimmed.match(/^\d+/)?.[0]}.</span>
              <span>{renderFormattedText(trimmed.replace(/^\d+\.\s*/, ""))}</span>
            </div>
          );
        }

        if (trimmed.startsWith("  •") || trimmed.startsWith("  -")) {
          return (
            <div key={i} className="text-sm leading-relaxed pl-4 flex items-start gap-1.5 text-muted-foreground">
              <span className="flex-shrink-0">•</span>
              <span>{renderFormattedText(trimmed.replace(/^\s*[•\-]\s*/, ""))}</span>
            </div>
          );
        }

        return (
          <div key={i} className="text-sm leading-relaxed">
            {renderFormattedText(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const AgentIcon = message.agentType ? agentIcons[message.agentType] || Bot : Bot;
  const colorClass = message.agentType ? agentColors[message.agentType] || "" : "";
  const agentLabel = message.agentType ? agentLabels[message.agentType] : null;
  const arabic = isArabic(message.content);
  const displayLabel = agentLabel ? (arabic ? agentLabel.ar : agentLabel.en) : (message.agentType?.replace("-", " ") || "agent");

  const hasAttachment = !!(message as any).attachmentType;
  const attachmentType = (message as any).attachmentType;
  const attachmentUrl = (message as any).attachmentUrl;
  const attachmentName = (message as any).attachmentName;

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`} data-testid={`message-${message.id}`}>
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser ? "bg-secondary" : colorClass || "bg-primary/15"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-secondary-foreground" />
        ) : (
          <AgentIcon className="w-3.5 h-3.5" />
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {message.agentType && !isUser && (
          <span className="text-[11px] font-medium text-muted-foreground capitalize mb-0.5 block" data-testid={`label-agent-${message.id}`}>
            {displayLabel}
          </span>
        )}
        <div
          className={`inline-block rounded-lg px-3 py-2 max-w-full ${
            isUser
              ? "bg-primary text-primary-foreground text-sm"
              : "bg-card border border-card-border text-card-foreground"
          }`}
          dir={arabic ? "rtl" : "ltr"}
        >
          {hasAttachment && attachmentType === "image" && attachmentUrl && (
            <div className="mb-2">
              <img
                src={attachmentUrl}
                alt={attachmentName || "uploaded image"}
                className="max-w-[240px] max-h-[180px] rounded-md object-cover border border-border/50"
                data-testid={`attachment-image-${message.id}`}
              />
            </div>
          )}
          {hasAttachment && attachmentType === "file" && (
            <div className="mb-2 flex items-center gap-2 bg-muted/50 rounded-md px-2.5 py-1.5" data-testid={`attachment-file-${message.id}`}>
              <FileCode className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{attachmentName}</span>
            </div>
          )}
          {isUser && !hasAttachment ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : isUser && hasAttachment ? (
            null
          ) : (
            <FormattedContent content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}
