import { useState, useEffect } from "react";
import type { AgentActivity } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageCircle,
  Search,
  Code,
  Cog,
  Bug,
  Brain,
  CheckCircle2,
  Loader2,
  Circle,
  AlertCircle,
  Cpu,
  Pause,
  Zap,
  RotateCw,
  SearchCode,
  Crown,
  Palette,
  RefreshCw,
  Wrench,
  Workflow,
} from "lucide-react";

const agentDefs = [
  { type: "supervisor", label: "Supervisor", labelAr: "المدير", emoji: "CEO", desc: "AI CEO — decomposes goals, assigns agents, monitors progress", descAr: "المدير التنفيذي — يحلل الأهداف ويوزع المهام", icon: Crown, color: "text-yellow-500" },
  { type: "coordinator", label: "ChattyCoordinator", labelAr: "المنسق", emoji: "CO", desc: "Routes requests, classifies intent, manages conversation flow", descAr: "يوجه الطلبات ويصنف النوايا ويدير المحادثة", icon: MessageCircle, color: "text-violet-500" },
  { type: "analyzer", label: "Strategic Planner", labelAr: "المخطط", emoji: "SP", desc: "Decomposes tasks, creates roadmaps, plans architecture", descAr: "يحلل المتطلبات ويخطط البنية ويصمم الحلول", icon: Search, color: "text-amber-500" },
  { type: "coder", label: "Senior Developer", labelAr: "المطوّر", emoji: "SD", desc: "Full-stack coding, feature implementation, integration", descAr: "يبرمج الواجهات والخوادم وينفذ الميزات", icon: Code, color: "text-blue-500" },
  { type: "runner", label: "DevOps Engineer", labelAr: "المشغّل", emoji: "DO", desc: "Deploys, runs projects, manages environments", descAr: "ينشر ويشغّل المشاريع ويدير البيئات", icon: Cog, color: "text-orange-500" },
  { type: "debugger", label: "QA Engineer", labelAr: "ضمان الجودة", emoji: "QA", desc: "Diagnoses errors, creates tests, ensures quality", descAr: "يشخص الأخطاء وينشئ الاختبارات ويضمن الجودة", icon: Bug, color: "text-red-500" },
  { type: "memory", label: "Knowledge Agent", labelAr: "الذاكرة", emoji: "KA", desc: "Retains context, learns patterns, tracks preferences", descAr: "يحتفظ بالسياق ويتعلم الأنماط ويتتبع التفضيلات", icon: Brain, color: "text-emerald-500" },
  { type: "research", label: "Research Agent", labelAr: "الباحث", emoji: "RA", desc: "Searches docs, analyzes repos, finds best practices", descAr: "يبحث في الوثائق ويحلل المستودعات", icon: SearchCode, color: "text-cyan-500" },
  { type: "ui-designer", label: "UI/UX Designer", labelAr: "المصمم", emoji: "UX", desc: "Generates layouts, suggests UX improvements, creates color schemes", descAr: "يولد التخطيطات ويقترح تحسينات التصميم", icon: Palette, color: "text-pink-500" },
  { type: "refactor", label: "Refactor Agent", labelAr: "المحسّن", emoji: "RF", desc: "Analyzes code smells, suggests refactoring, modernizes patterns", descAr: "يحلل جودة الكود ويقترح التحسينات", icon: RefreshCw, color: "text-teal-500" },
  { type: "tool-builder", label: "Tool Builder", labelAr: "صانع الأدوات", emoji: "TB", desc: "Auto-generates internal tools, extends agent capabilities", descAr: "ينشئ أدوات داخلية ويوسع قدرات الوكلاء", icon: Wrench, color: "text-indigo-500" },
];

const legacyToV3Map: Record<string, string> = {
  vision: "coordinator",
  planner: "analyzer",
  architect: "analyzer",
  "ui-designer": "coder",
  backend: "coder",
  frontend: "coder",
  developer: "coder",
  tester: "debugger",
  optimizer: "debugger",
  security: "debugger",
  docs: "memory",
  deployer: "memory",
  monitor: "memory",
  supervisor: "supervisor",
};

interface AgentLoopStatus {
  state: string;
  iteration: number;
  maxIterations: number;
}

interface SmartBuildStatus {
  phase: string;
  totalTasks: number;
  completedTasks: number;
  suggestion: string | null;
}

interface AgentPipelineProps {
  projectId: string;
  activities: AgentActivity[];
  agentLoopStatus?: AgentLoopStatus | null;
  smartBuildStatus?: SmartBuildStatus | null;
}

const stateLabels: Record<string, string> = {
  analyzing: "Analyzing",
  planning: "Planning",
  proposing: "Proposing Plan",
  waiting_approval: "Awaiting Approval",
  approved: "Approved",
  executing: "Executing",
  observing: "Observing",
  correcting: "Self-correcting",
  waiting_for_human: "Waiting for Response",
  complete: "Complete",
  error: "Error",
  idle: "Idle",
};

const smartPhaseLabels: Record<string, string> = {
  idea: "Receiving Idea",
  decomposition: "Decomposing Goal",
  planning: "Creating Plan",
  approval: "Awaiting Approval",
  execution: "Executing Tasks",
  improvement: "Analyzing Improvements",
  complete: "Complete",
  error: "Error",
};

export function AgentPipeline({ projectId, activities, agentLoopStatus, smartBuildStatus }: AgentPipelineProps) {
  const isAutonomousActive = agentLoopStatus != null &&
    agentLoopStatus.state !== "idle" && agentLoopStatus.state !== "complete" && agentLoopStatus.state !== "error";
  const isSmartBuildActive = smartBuildStatus != null &&
    smartBuildStatus.phase !== "complete" && smartBuildStatus.phase !== "error" && smartBuildStatus.phase !== "idea";

  const getAgentStatus = (agentType: string) => {
    const directActivities = activities.filter((a) => a.agentType === agentType);
    if (directActivities.length > 0) {
      const latest = directActivities[0];
      return { status: latest.status, message: latest.message };
    }
    const mappedActivities = activities.filter((a) => legacyToV3Map[a.agentType] === agentType);
    if (mappedActivities.length > 0) {
      const latest = mappedActivities[0];
      return { status: latest.status, message: latest.message };
    }
    return { status: "idle", message: "" };
  };

  const completedCount = agentDefs.filter(a => getAgentStatus(a.type).status === "completed").length;
  const runningAgent = agentDefs.find(a => getAgentStatus(a.type).status === "running");
  const waitingAgent = agentDefs.find(a => getAgentStatus(a.type).status === "waiting");

  return (
    <div className="flex-1 flex flex-col min-w-0" data-testid="agent-pipeline">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Cpu className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Agent Pipeline</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">v5.0</span>
        {isAutonomousActive && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium flex items-center gap-1" data-testid="badge-autonomous">
            <Zap className="w-3 h-3" />
            Autonomous
          </span>
        )}
        {isSmartBuildActive && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 font-medium flex items-center gap-1" data-testid="badge-smart-build">
            <Workflow className="w-3 h-3" />
            Smart Build
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {completedCount}/{agentDefs.length} agents
        </span>
      </div>

      {isAutonomousActive && agentLoopStatus && (
        <div className="px-4 py-2 border-b border-border bg-amber-500/5">
          <div className="flex items-center gap-2 mb-1">
            <RotateCw className="w-3 h-3 text-amber-500 animate-spin" />
            <span className="text-[11px] text-amber-500 font-medium">
              {stateLabels[agentLoopStatus.state] || agentLoopStatus.state}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              Iteration {agentLoopStatus.iteration}/{agentLoopStatus.maxIterations}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${(agentLoopStatus.iteration / agentLoopStatus.maxIterations) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isSmartBuildActive && smartBuildStatus && (
        <div className="px-4 py-2 border-b border-border bg-violet-500/5" data-testid="smart-build-indicator">
          <div className="flex items-center gap-2 mb-1">
            <Workflow className="w-3 h-3 text-violet-500 animate-pulse" />
            <span className="text-[11px] text-violet-500 font-medium">
              {smartPhaseLabels[smartBuildStatus.phase] || smartBuildStatus.phase}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              {smartBuildStatus.completedTasks}/{smartBuildStatus.totalTasks} tasks
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${smartBuildStatus.totalTasks > 0 ? (smartBuildStatus.completedTasks / smartBuildStatus.totalTasks) * 100 : 0}%` }}
            />
          </div>
          {smartBuildStatus.suggestion && (
            <p className="text-[10px] text-violet-400 mt-1 truncate" data-testid="text-smart-suggestion">
              {smartBuildStatus.suggestion}
            </p>
          )}
        </div>
      )}

      {(completedCount > 0 || runningAgent) && (
        <div className="px-4 py-2 border-b border-border bg-card/30">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / agentDefs.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {Math.round((completedCount / agentDefs.length) * 100)}%
            </span>
          </div>
          {runningAgent && (
            <p className="text-[11px] text-primary flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {runningAgent.emoji} {runningAgent.label} is working...
            </p>
          )}
          {waitingAgent && !runningAgent && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1 animate-pulse">
              <Pause className="w-3 h-3" />
              {waitingAgent.emoji} Waiting for your response...
            </p>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="relative">
            <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />
            <div className="space-y-0.5">
              {agentDefs.map((agent) => {
                const { status, message } = getAgentStatus(agent.type);
                const Icon = agent.icon;
                const isWaiting = status === "waiting";
                const StatusIcon =
                  status === "completed" ? CheckCircle2 :
                  status === "running" ? Loader2 :
                  status === "error" ? AlertCircle :
                  isWaiting ? Pause :
                  Circle;
                const statusColor =
                  status === "completed" ? "text-emerald-500" :
                  status === "running" ? "text-primary" :
                  status === "error" ? "text-destructive" :
                  isWaiting ? "text-amber-400" :
                  "text-muted-foreground/30";

                return (
                  <div
                    key={agent.type}
                    className={`relative flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      status === "running" ? "bg-primary/5 border border-primary/10" :
                      isWaiting ? "bg-amber-500/5 border border-amber-500/10 animate-pulse" :
                      status === "completed" ? "opacity-90" : "opacity-50"
                    }`}
                    data-testid={`agent-${agent.type}`}
                  >
                    <div className="relative z-10 flex-shrink-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        status === "completed" ? "bg-emerald-500/10" :
                        status === "running" ? "bg-primary/10" :
                        isWaiting ? "bg-amber-500/10" :
                        "bg-muted/30"
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          status === "completed" ? "text-emerald-500" :
                          status === "running" ? agent.color :
                          isWaiting ? "text-amber-400" :
                          "text-muted-foreground/40"
                        }`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-medium text-foreground">
                          {agent.emoji} {agent.label}
                        </span>
                        <StatusIcon className={`w-3 h-3 ${statusColor} ${status === "running" ? "animate-spin" : ""}`} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">{agent.desc}</p>
                      {status !== "idle" && message && (
                        <p className={`text-[11px] mt-0.5 ${
                          status === "running" ? "text-primary" :
                          isWaiting ? "text-amber-400" :
                          "text-emerald-500/80"
                        }`}>
                          {message}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
