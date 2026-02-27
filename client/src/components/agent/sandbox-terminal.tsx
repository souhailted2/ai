import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TerminalSquare, Trash2, ArrowDownToLine } from "lucide-react";

export interface SandboxTerminalEntry {
  id: string;
  type: "stdout" | "stderr" | "thought" | "plan" | "code" | "observation" | "error" | "correction" | "state-change" | "complete" | "ask-human" | "human-response" | "approval-required" | "approved" | "rejected" | "proposal";
  message: string;
  timestamp: number;
  iteration?: number;
}

interface SandboxTerminalProps {
  entries: SandboxTerminalEntry[];
  onClear?: () => void;
}

const typeColors: Record<string, string> = {
  stdout: "text-emerald-400",
  stderr: "text-red-400",
  thought: "text-blue-400",
  plan: "text-amber-400",
  code: "text-purple-400",
  observation: "text-emerald-400",
  error: "text-red-400",
  correction: "text-orange-400",
  "state-change": "text-cyan-400",
  complete: "text-emerald-500",
  "ask-human": "text-amber-300",
  "human-response": "text-emerald-300",
  "approval-required": "text-amber-400",
  approved: "text-emerald-400",
  rejected: "text-red-400",
  proposal: "text-amber-300",
};

const typePrefixes: Record<string, string> = {
  stdout: "[OUT]",
  stderr: "[ERR]",
  thought: "[THINK]",
  plan: "[PLAN]",
  code: "[CODE]",
  observation: "[OBS]",
  error: "[ERROR]",
  correction: "[FIX]",
  "state-change": "[STATE]",
  complete: "[DONE]",
  "ask-human": "[ASK]",
  "human-response": "[REPLY]",
  "approval-required": "[APPROVE?]",
  approved: "[APPROVED]",
  rejected: "[REJECTED]",
  proposal: "[PROPOSAL]",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SandboxTerminal({ entries, onClear }: SandboxTerminalProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [cleared, setCleared] = useState(false);
  const [clearTimestamp, setClearTimestamp] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleEntries = cleared
    ? entries.filter((e) => e.timestamp > clearTimestamp)
    : entries;

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  const handleClear = useCallback(() => {
    setCleared(true);
    setClearTimestamp(Date.now());
    onClear?.();
  }, [onClear]);

  const activeIterations = new Set(visibleEntries.filter(e => e.iteration !== undefined).map(e => e.iteration));
  const errorCount = visibleEntries.filter(e => e.type === "error" || e.type === "stderr").length;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background" data-testid="sandbox-terminal">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
        <TerminalSquare className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Agent Output</span>
        <div className="flex items-center gap-2 ml-auto">
          {visibleEntries.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] mr-2">
              <span className="text-muted-foreground" data-testid="text-sandbox-event-count">
                {visibleEntries.length} events
              </span>
              {activeIterations.size > 0 && (
                <span className="text-cyan-400" data-testid="text-sandbox-iterations">
                  {activeIterations.size} iter
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-red-400" data-testid="text-sandbox-errors">
                  {errorCount} errors
                </span>
              )}
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
            data-testid="button-sandbox-auto-scroll"
          >
            <ArrowDownToLine className={`w-3.5 h-3.5 ${autoScroll ? "text-primary" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClear}
            title="Clear output"
            data-testid="button-sandbox-clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 font-mono text-xs space-y-0.5">
          {visibleEntries.length === 0 ? (
            <div className="space-y-1" data-testid="text-sandbox-empty">
              <div className="text-primary">$ agent --mode autonomous</div>
              <div className="text-muted-foreground">Waiting for agent events...</div>
              <div className="text-muted-foreground/50">Real-time agent output will stream here.</div>
              <div className="text-muted-foreground animate-pulse">_</div>
            </div>
          ) : (
            visibleEntries.map((entry) => {
              const color = typeColors[entry.type] || "text-muted-foreground";
              const prefix = typePrefixes[entry.type] || `[${entry.type.toUpperCase()}]`;

              const isAskHuman = entry.type === "ask-human";
              const isApproval = entry.type === "approval-required" || entry.type === "proposal";

              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-2 py-0.5 ${color} ${
                    isAskHuman ? "bg-amber-500/10 rounded-md px-2 py-1.5 border border-amber-500/20" :
                    isApproval ? "bg-amber-500/5 rounded-md px-2 py-1 border border-amber-500/10" :
                    ""
                  }`}
                  data-testid={`row-sandbox-entry-${entry.id}`}
                >
                  <span className="text-muted-foreground/60 shrink-0 select-none w-[60px] text-right">
                    {formatTime(entry.timestamp)}
                  </span>
                  {entry.iteration !== undefined && (
                    <span className="text-cyan-500/60 shrink-0 select-none w-[28px] text-right">
                      #{entry.iteration}
                    </span>
                  )}
                  <span className="font-semibold shrink-0 w-[56px]">{prefix}</span>
                  <span className="whitespace-pre-wrap break-all flex-1">{entry.message}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
