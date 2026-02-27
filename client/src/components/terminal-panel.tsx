import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentActivity } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Terminal, Trash2, ArrowDownToLine, Clock, CheckCircle2, AlertCircle, Loader2, CircleDot, Code2, TerminalSquare } from "lucide-react";
import { CodeActViewer, type CodeActEntry } from "@/components/agent/codeact-viewer";
import { SandboxTerminal, type SandboxTerminalEntry } from "@/components/agent/sandbox-terminal";

type TerminalTab = "timeline" | "agent-output" | "codeact";

interface RunnerOutput {
  type: "stdout" | "stderr" | "exit" | "error";
  data: string;
  timestamp: number;
}

interface TerminalPanelProps {
  projectId: string;
  activities: AgentActivity[];
  runnerOutputs?: RunnerOutput[];
  agentEvents?: SandboxTerminalEntry[];
  codeActEntries?: CodeActEntry[];
}

const statusConfig: Record<string, { color: string; textColor: string; icon: typeof CheckCircle2; label: string }> = {
  completed: { color: "bg-emerald-500", textColor: "text-emerald-400", icon: CheckCircle2, label: "Completed" },
  running: { color: "bg-amber-500", textColor: "text-amber-400", icon: Loader2, label: "Running" },
  error: { color: "bg-red-500", textColor: "text-red-400", icon: AlertCircle, label: "Error" },
  pending: { color: "bg-muted-foreground/40", textColor: "text-muted-foreground", icon: CircleDot, label: "Pending" },
};

function getStatusInfo(status: string) {
  return statusConfig[status] || statusConfig.pending;
}

const v3AgentNames: Record<string, string> = {
  coordinator: "💬 ChattyCoordinator",
  analyzer: "🔍 SmartAnalyzer",
  coder: "💻 CollaborativeCoder",
  runner: "⚙️ Runner",
  debugger: "🐛 FriendlyDebugger",
  memory: "🧠 MemoryKeeper",
};

function agentDisplayName(type: string): string {
  return v3AgentNames[type] || type;
}

function formatTimestamp(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function estimateDuration(activity: AgentActivity, allActivities: AgentActivity[]): string | null {
  if (activity.status === "pending") return null;
  const created = new Date(activity.createdAt).getTime();
  const sorted = allActivities
    .filter((a) => new Date(a.createdAt).getTime() > created)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (sorted.length > 0) {
    const next = new Date(sorted[0].createdAt).getTime();
    const diff = next - created;
    if (diff < 1000) return "<1s";
    if (diff < 60000) return `${Math.round(diff / 1000)}s`;
    return `${Math.round(diff / 60000)}m`;
  }
  if (activity.status === "running") return "...";
  return "<1s";
}

function groupByPipelineRun(activities: AgentActivity[]): AgentActivity[][] {
  if (activities.length === 0) return [];
  const sorted = [...activities].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const groups: AgentActivity[][] = [];
  let currentGroup: AgentActivity[] = [];
  let lastTime = 0;

  for (const activity of sorted) {
    const time = new Date(activity.createdAt).getTime();
    if (currentGroup.length > 0 && time - lastTime > 30000) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(activity);
    lastTime = time;
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

export function TerminalPanel({ projectId, activities, runnerOutputs = [], agentEvents = [], codeActEntries = [] }: TerminalPanelProps) {
  const [activeTab, setActiveTab] = useState<TerminalTab>("timeline");
  const [cleared, setCleared] = useState(false);
  const [clearTimestamp, setClearTimestamp] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const visibleActivities = cleared
    ? activities.filter((a) => new Date(a.createdAt).getTime() > clearTimestamp)
    : activities;

  const groups = groupByPipelineRun(visibleActivities);

  useEffect(() => {
    if (autoScroll && bottomRef.current && activeTab === "timeline") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activities.length, autoScroll, activeTab]);

  const handleClear = () => {
    setCleared(true);
    setClearTimestamp(Date.now());
  };

  const completedCount = visibleActivities.filter((a) => a.status === "completed").length;
  const runningCount = visibleActivities.filter((a) => a.status === "running").length;
  const errorCount = visibleActivities.filter((a) => a.status === "error").length;

  const tabs: { id: TerminalTab; label: string; icon: typeof Terminal }[] = [
    { id: "timeline", label: "Build Timeline", icon: Terminal },
    { id: "agent-output", label: "Agent Output", icon: TerminalSquare },
    { id: "codeact", label: "CodeAct", icon: Code2 },
  ];

  if (activeTab === "agent-output") {
    return (
      <div className="flex-1 flex flex-col min-w-0 bg-background" data-testid="terminal-panel">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
                data-testid={`button-tab-${tab.id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <SandboxTerminal entries={agentEvents} />
      </div>
    );
  }

  if (activeTab === "codeact") {
    return (
      <div className="flex-1 flex flex-col min-w-0 bg-background" data-testid="terminal-panel">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
                data-testid={`button-tab-${tab.id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <CodeActViewer entries={codeActEntries} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background" data-testid="terminal-panel">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
              data-testid={`button-tab-${tab.id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
        <div className="flex items-center gap-2 ml-auto">
          {visibleActivities.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] mr-2">
              {completedCount > 0 && (
                <span className="text-emerald-400" data-testid="text-completed-count">{completedCount} done</span>
              )}
              {runningCount > 0 && (
                <span className="text-amber-400" data-testid="text-running-count">{runningCount} running</span>
              )}
              {errorCount > 0 && (
                <span className="text-red-400" data-testid="text-error-count">{errorCount} errors</span>
              )}
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
            data-testid="button-auto-scroll"
          >
            <ArrowDownToLine className={`w-3.5 h-3.5 ${autoScroll ? "text-primary" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClear}
            title="Clear terminal"
            data-testid="button-clear-terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 font-mono text-xs space-y-4">
          {groups.length === 0 ? (
            <div className="space-y-1" data-testid="text-terminal-empty">
              <div className="text-emerald-500">$ ai-factory build --project {projectId.slice(0, 8)}</div>
              <div className="text-muted-foreground">Waiting for pipeline to start...</div>
              <div className="text-muted-foreground/50">Agent steps will appear here as they execute.</div>
              <div className="text-muted-foreground animate-pulse">_</div>
            </div>
          ) : (
            groups.map((group, groupIdx) => {
              const startTime = new Date(group[0].createdAt);
              const endActivity = [...group].reverse().find((a) => a.status === "completed" || a.status === "error");
              const endTime = endActivity ? new Date(endActivity.createdAt) : null;
              const totalMs = endTime ? endTime.getTime() - startTime.getTime() : null;

              return (
                <div key={groupIdx} className="space-y-1" data-testid={`section-pipeline-run-${groupIdx}`}>
                  <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                    <span className="text-primary font-semibold text-[11px]">
                      Pipeline Run #{groupIdx + 1}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {formatTimestamp(startTime)}
                    </span>
                    {totalMs !== null && (
                      <span className="text-muted-foreground text-[10px] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {totalMs < 1000 ? "<1s" : totalMs < 60000 ? `${Math.round(totalMs / 1000)}s` : `${Math.round(totalMs / 60000)}m`}
                      </span>
                    )}
                  </div>

                  {group.map((activity) => {
                    const info = getStatusInfo(activity.status);
                    const StatusIcon = info.icon;
                    const duration = estimateDuration(activity, group);

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-2 py-1"
                        data-testid={`row-activity-${activity.id}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 shrink-0 pt-0.5">
                          <div className={`w-2 h-2 rounded-full ${info.color} shrink-0`} />
                          <StatusIcon className={`w-3 h-3 ${info.textColor} shrink-0 ${activity.status === "running" ? "animate-spin" : ""}`} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold ${info.textColor}`} data-testid={`text-agent-type-${activity.id}`}>
                              [{agentDisplayName(activity.agentType)}]
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                              {formatTimestamp(new Date(activity.createdAt))}
                            </span>
                            {duration && (
                              <span className="text-muted-foreground/60 text-[10px]">
                                {duration}
                              </span>
                            )}
                          </div>
                          <div className={`${
                            activity.status === "error"
                              ? "text-red-400"
                              : activity.status === "completed"
                              ? "text-foreground/80"
                              : activity.status === "running"
                              ? "text-amber-300/80"
                              : "text-muted-foreground/60"
                          }`} data-testid={`text-activity-message-${activity.id}`}>
                            {activity.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {group.every((a) => a.status === "completed") && (
                    <div className="text-emerald-500 pt-1 text-[11px]" data-testid={`text-run-complete-${groupIdx}`}>
                      Pipeline run #{groupIdx + 1} completed — {group.length} agents finished.
                    </div>
                  )}
                </div>
              );
            })
          )}
          {runnerOutputs.length > 0 && (
            <div className="space-y-0.5 border-t border-border/50 pt-2 mt-2" data-testid="section-runner-output">
              <div className="flex items-center gap-2 pb-1">
                <span className="text-orange-400 font-semibold text-[11px]">Runner Output</span>
              </div>
              {runnerOutputs.map((output, idx) => (
                <div
                  key={idx}
                  className={`whitespace-pre-wrap break-all ${
                    output.type === "stderr" || output.type === "error"
                      ? "text-red-400"
                      : output.type === "exit"
                      ? "text-muted-foreground"
                      : "text-emerald-400"
                  }`}
                  data-testid={`text-runner-output-${idx}`}
                >
                  {output.data}
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
