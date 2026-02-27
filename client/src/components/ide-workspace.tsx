import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectFile, ChatMessage, AgentActivity } from "@shared/schema";
import { ChatPanel } from "@/components/chat-panel";
import { FileExplorer } from "@/components/file-explorer";
import { CodeViewer } from "@/components/code-viewer";
import { AgentPipeline } from "@/components/agent-pipeline";
import { TerminalPanel } from "@/components/terminal-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { MonitoringPanel } from "@/components/monitoring-panel";
import { CommandPalette, getDefaultCommands } from "@/components/command-palette";
import { SnapshotPanel } from "@/components/snapshot-panel";
import { ApprovalDialog, AskHumanDialog } from "@/components/approval-dialog";
import {
  MessageSquare,
  FolderTree,
  Code2,
  Activity,
  Terminal,
  Monitor,
  BarChart3,
  Maximize2,
  Minimize2,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type PanelType = "chat" | "files" | "code" | "agents" | "terminal" | "preview" | "monitoring" | "snapshots";

const panels: { id: PanelType; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "AI Chat", icon: MessageSquare },
  { id: "preview", label: "Preview", icon: Monitor },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "code", label: "Code", icon: Code2 },
  { id: "agents", label: "Agents", icon: Activity },
  { id: "monitoring", label: "Monitor", icon: BarChart3 },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "snapshots", label: "Snapshots", icon: History },
];

const statusLabels: Record<string, string> = {
  planning: "Planning",
  designing: "Designing Architecture",
  coding: "Generating Code",
  testing: "Running Tests",
  ready: "Ready",
  deployed: "Deployed",
};

const statusDotColors: Record<string, string> = {
  planning: "bg-amber-500",
  designing: "bg-blue-500",
  coding: "bg-purple-500",
  testing: "bg-cyan-500",
  ready: "bg-emerald-500",
  deployed: "bg-green-500",
};

interface IDEWorkspaceProps {
  project: Project;
}

interface AgentEvent {
  type: string;
  timestamp: number;
  payload: any;
  iteration?: number;
}

interface CodeActEntry {
  id: string;
  code: string;
  output: string;
  status: "generated" | "executing" | "completed" | "error";
  error?: string;
  toolsCalled?: string[];
  iteration?: number;
  timestamp: number;
}

export function IDEWorkspace({ project }: IDEWorkspaceProps) {
  const [activePanel, setActivePanel] = useState<PanelType>("chat");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [runnerOutputs, setRunnerOutputs] = useState<Array<{ type: "stdout" | "stderr" | "exit" | "error"; data: string; timestamp: number }>>([]);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [codeActEntries, setCodeActEntries] = useState<CodeActEntry[]>([]);
  const [agentLoopStatus, setAgentLoopStatus] = useState<{ state: string; iteration: number; maxIterations: number } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalData, setApprovalData] = useState<{ planGoal?: string; planSteps?: Array<{ id: string; description: string; toolHints?: string[] }> }>({});
  const [askHumanOpen, setAskHumanOpen] = useState(false);
  const [askHumanQuestion, setAskHumanQuestion] = useState("");
  const [smartBuildStatus, setSmartBuildStatus] = useState<{ active: boolean; phase?: string; completedTasks?: number; totalTasks?: number; suggestion?: string | null } | null>(null);

  const { data: files = [] } = useQuery<ProjectFile[]>({
    queryKey: ["/api/projects", project.id, "files"],
    refetchInterval: 3000,
  });

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/projects", project.id, "messages"],
    refetchInterval: 3000,
  });

  const { data: activities = [] } = useQuery<AgentActivity[]>({
    queryKey: ["/api/projects", project.id, "activities"],
    refetchInterval: 3000,
  });

  const selectedFile = files.find((f) => f.id === selectedFileId);

  const terminalEntries = useMemo(() => {
    return agentEvents.map((evt, i) => ({
      id: `agent-evt-${i}-${evt.timestamp}`,
      type: evt.type as any,
      message: typeof evt.payload === "string" ? evt.payload : (evt.payload?.message || evt.payload?.output || evt.payload?.code || evt.payload?.state || JSON.stringify(evt.payload || "")),
      timestamp: evt.timestamp,
      iteration: evt.iteration,
    }));
  }, [agentEvents]);

  const sendChatMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/chat`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "activities"] });
      setActivePanel("chat");
    },
  });

  const handleSendToChat = useCallback((message: string) => {
    sendChatMutation.mutate(message);
  }, [sendChatMutation]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "agent-event" && data.projectId === project.id && data.event) {
          const agentEvent = data.event as AgentEvent;
          setAgentEvents(prev => [...prev, agentEvent]);

          if (agentEvent.type === "code") {
            const entryId = `codeact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            setCodeActEntries(prev => [...prev, {
              id: entryId,
              code: agentEvent.payload?.code || "",
              output: "",
              status: "generated" as const,
              iteration: agentEvent.iteration,
              timestamp: agentEvent.timestamp,
            }]);
          } else if (agentEvent.type === "observation" && agentEvent.payload) {
            setCodeActEntries(prev => {
              const updated = [...prev];
              if (updated.length > 0) {
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  output: agentEvent.payload.output || "",
                  status: agentEvent.payload.error ? "error" : "completed",
                  error: agentEvent.payload.error,
                  toolsCalled: agentEvent.payload.toolsCalled,
                };
              }
              return updated;
            });
          } else if (agentEvent.type === "proposal" && agentEvent.payload) {
            setApprovalData({
              planGoal: agentEvent.payload.goal,
              planSteps: agentEvent.payload.steps,
            });
          } else if (agentEvent.type === "approval-required") {
            setApprovalOpen(true);
          } else if (agentEvent.type === "approved" || agentEvent.type === "rejected") {
            setApprovalOpen(false);
          } else if (agentEvent.type === "ask-human" && agentEvent.payload) {
            setAskHumanQuestion(agentEvent.payload.question || "The agent needs your input.");
            setAskHumanOpen(true);
          } else if (agentEvent.type === "human-response") {
            setAskHumanOpen(false);
          } else if (agentEvent.type === "state-change" && agentEvent.payload) {
            setAgentLoopStatus(prev => ({
              state: agentEvent.payload.state,
              iteration: agentEvent.payload.iteration || prev?.iteration || 0,
              maxIterations: prev?.maxIterations || 20,
            }));
          } else if (agentEvent.type === "complete") {
            setAgentLoopStatus(prev => prev ? { ...prev, state: "complete" } : null);
          }
        } else if (data.type === "runner-output" && data.projectId === project.id) {
          setRunnerOutputs(prev => [...prev, data.output]);
        } else if (data.type === "smart-pipeline" && data.projectId === project.id) {
          setSmartBuildStatus({
            active: true,
            phase: data.phase,
            completedTasks: data.completedTasks,
            totalTasks: data.totalTasks,
            suggestion: data.suggestion,
          });
        }
      } catch {}
    };
    return () => { ws.close(); };
  }, [project.id]);

  const commands = useMemo(() => {
    return getDefaultCommands({
      onSwitchPanel: (panel) => setActivePanel(panel as PanelType),
      onSaveFile: () => {
        const saveEvent = new CustomEvent("ide-save");
        window.dispatchEvent(saveEvent);
      },
      onNewFile: () => {
        setActivePanel("files");
        setTimeout(() => {
          const btn = document.querySelector('[data-testid="button-new-file"]') as HTMLButtonElement;
          btn?.click();
        }, 100);
      },
      onToggleSplit: () => {
        setSplitMode((prev) => !prev);
        if (activePanel !== "code" && activePanel !== "files") {
          setActivePanel("code");
        }
      },
      onSaveSnapshot: () => {
        apiRequest("POST", `/api/projects/${project.id}/snapshot`, {
          name: `Quick Snapshot ${new Date().toLocaleString()}`,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "snapshots"] });
        }).catch(() => {});
      },
    });
  }, [project.id, activePanel]);

  useEffect(() => {
    const panelKeys: PanelType[] = ["chat", "preview", "files", "code", "agents", "monitoring", "terminal", "snapshots"];
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (!mod) return;

      const target = e.target as HTMLElement;
      const isEditing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        const saveEvent = new CustomEvent("ide-save");
        window.dispatchEvent(saveEvent);
        return;
      }

      if (isEditing) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setActivePanel("files");
        setTimeout(() => {
          const btn = document.querySelector('[data-testid="button-new-file"]') as HTMLButtonElement;
          btn?.click();
        }, 100);
        return;
      }

      const num = parseInt(e.key);
      if (num >= 1 && num <= panelKeys.length) {
        e.preventDefault();
        setActivePanel(panelKeys[num - 1]);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full" data-testid="ide-workspace">
      <div className="flex items-center justify-between gap-1 px-4 h-12 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate" data-testid="text-project-name">
            {project.name}
          </h2>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDotColors[project.status] || "bg-gray-400"}`} />
            <span className="text-[11px] text-muted-foreground">
              {statusLabels[project.status] || project.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {project.stack}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {files.length} files
          </Badge>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded-md text-muted-foreground transition-colors"
            data-testid="button-maximize"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-12 flex-shrink-0 flex flex-col items-center py-2 gap-1 border-r border-border bg-sidebar">
          {panels.map((panel) => {
            const Icon = panel.icon;
            const isActive = activePanel === panel.id;
            return (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
                title={panel.label}
                data-testid={`button-panel-${panel.id}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 flex">
          {activePanel === "chat" && (
            <ChatPanel projectId={project.id} messages={messages} />
          )}
          {activePanel === "preview" && (
            <PreviewPanel files={files} projectName={project.name} projectId={project.id} onSendToChat={handleSendToChat} />
          )}
          {activePanel === "files" && (
            <div className="flex flex-1">
              <FileExplorer
                files={files}
                selectedFileId={selectedFileId}
                onSelectFile={(id) => {
                  setSelectedFileId(id);
                }}
                projectId={project.id}
              />
              <CodeViewer
                files={files}
                selectedFileId={selectedFileId}
                onSelectFile={setSelectedFileId}
                projectId={project.id}
                splitMode={splitMode}
                onToggleSplit={() => setSplitMode((prev) => !prev)}
              />
            </div>
          )}
          {activePanel === "code" && (
            <div className="flex flex-1">
              <FileExplorer
                files={files}
                selectedFileId={selectedFileId}
                onSelectFile={setSelectedFileId}
                projectId={project.id}
              />
              <CodeViewer
                files={files}
                selectedFileId={selectedFileId}
                onSelectFile={setSelectedFileId}
                projectId={project.id}
                splitMode={splitMode}
                onToggleSplit={() => setSplitMode((prev) => !prev)}
              />
            </div>
          )}
          {activePanel === "agents" && (
            <AgentPipeline projectId={project.id} activities={activities} agentLoopStatus={agentLoopStatus} smartBuildStatus={smartBuildStatus} />
          )}
          {activePanel === "monitoring" && (
            <MonitoringPanel
              projectId={project.id}
              activities={activities}
              fileCount={files.length}
              status={project.status}
            />
          )}
          {activePanel === "terminal" && (
            <TerminalPanel projectId={project.id} activities={activities} runnerOutputs={runnerOutputs} agentEvents={terminalEntries} codeActEntries={codeActEntries} />
          )}
          {activePanel === "snapshots" && (
            <div className="flex-1">
              <SnapshotPanel projectId={project.id} />
            </div>
          )}
        </div>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={commands}
      />

      <ApprovalDialog
        open={approvalOpen}
        onApprove={() => {
          setApprovalOpen(false);
          apiRequest("POST", `/api/agent/approve/${project.id}`, {}).catch(() => {});
        }}
        onReject={(feedback) => {
          setApprovalOpen(false);
          apiRequest("POST", `/api/agent/reject/${project.id}`, { feedback }).catch(() => {});
        }}
        planGoal={approvalData.planGoal}
        planSteps={approvalData.planSteps}
      />

      <AskHumanDialog
        open={askHumanOpen}
        question={askHumanQuestion}
        onRespond={(response) => {
          setAskHumanOpen(false);
          apiRequest("POST", `/api/agent/respond/${project.id}`, { response }).catch(() => {});
        }}
      />
    </div>
  );
}
