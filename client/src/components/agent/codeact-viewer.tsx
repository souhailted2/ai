import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Code2, ChevronDown, ChevronRight, Copy, Check, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import Editor from "@monaco-editor/react";

export type CodeActStatus = "idle" | "generated" | "executing" | "completed" | "error";

export interface CodeActEntry {
  id: string;
  stepId?: string;
  code: string;
  status: CodeActStatus;
  output?: string;
  error?: string;
  toolsCalled?: string[];
  timestamp: number;
  iteration?: number;
}

interface CodeActViewerProps {
  entries: CodeActEntry[];
}

const statusConfig: Record<CodeActStatus, { label: string; color: string; icon: typeof Clock }> = {
  idle: { label: "Idle", color: "text-muted-foreground", icon: Clock },
  generated: { label: "Generated", color: "text-blue-400", icon: Code2 },
  executing: { label: "Executing...", color: "text-amber-400", icon: Loader2 },
  completed: { label: "Completed", color: "text-emerald-400", icon: CheckCircle2 },
  error: { label: "Error", color: "text-red-400", icon: AlertCircle },
};

function CodeActEntryCard({ entry }: { entry: CodeActEntry }) {
  const [expanded, setExpanded] = useState(entry.status === "executing" || entry.status === "generated");
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = statusConfig[entry.status] || statusConfig.idle;
  const StatusIcon = config.icon;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="border border-border rounded-md overflow-visible" data-testid={`card-codeact-${entry.id}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer flex-wrap"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-toggle-codeact-${entry.id}`}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <Code2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground">
          {entry.stepId ? `Step: ${entry.stepId}` : `CodeAct #${entry.id}`}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <StatusIcon className={`w-3.5 h-3.5 ${config.color} ${entry.status === "executing" ? "animate-spin" : ""}`} />
          <span className={`text-[11px] font-medium ${config.color}`} data-testid={`text-codeact-status-${entry.id}`}>
            {config.label}
          </span>
          <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
          {entry.iteration !== undefined && (
            <Badge variant="secondary" className="text-[9px]" data-testid={`badge-iteration-${entry.id}`}>
              iter {entry.iteration}
            </Badge>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between gap-1 px-3 py-1.5 bg-muted/30 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-mono">JavaScript</span>
            <div className="flex items-center gap-1">
              {entry.toolsCalled && entry.toolsCalled.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {entry.toolsCalled.map((tool, i) => (
                    <Badge key={i} variant="outline" className="text-[9px]" data-testid={`badge-tool-${entry.id}-${i}`}>
                      {tool}
                    </Badge>
                  ))}
                </div>
              )}
              <Button size="icon" variant="ghost" onClick={handleCopy} data-testid={`button-copy-code-${entry.id}`}>
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>
          <div className="h-[200px]" data-testid={`editor-codeact-${entry.id}`}>
            <Editor
              height="100%"
              language="javascript"
              value={entry.code}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                fontSize: 12,
                wordWrap: "on",
                folding: true,
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { vertical: "auto", horizontal: "auto" },
              }}
            />
          </div>

          {(entry.output || entry.error) && (
            <div className="border-t border-border">
              <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer flex-wrap"
                onClick={(e) => { e.stopPropagation(); setOutputExpanded(!outputExpanded); }}
                data-testid={`button-toggle-output-${entry.id}`}
              >
                {outputExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                <span className="text-[11px] font-medium text-muted-foreground">
                  {entry.error ? "Error Output" : "Execution Output"}
                </span>
              </div>
              {outputExpanded && (
                <div className="px-3 pb-3">
                  <pre
                    className={`text-xs font-mono whitespace-pre-wrap break-all p-2 rounded-md bg-muted/50 max-h-[200px] overflow-auto ${
                      entry.error ? "text-red-400" : "text-emerald-400"
                    }`}
                    data-testid={`text-codeact-output-${entry.id}`}
                  >
                    {entry.error || entry.output}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CodeActViewer({ entries }: CodeActViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background" data-testid="codeact-viewer">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
        <Code2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">CodeAct Viewer</span>
        {entries.length > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-auto" data-testid="badge-codeact-count">
            {entries.length} execution{entries.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="text-codeact-empty">
              <Code2 className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No CodeAct executions yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Agent-generated code will appear here during autonomous execution</p>
            </div>
          ) : (
            entries.map((entry) => <CodeActEntryCard key={entry.id} entry={entry} />)
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
