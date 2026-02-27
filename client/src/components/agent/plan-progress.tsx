import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  Flag,
  Clock,
  Wrench,
  ListChecks,
  Target,
} from "lucide-react";

type PlanStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PlanStep {
  id: string;
  description: string;
  toolHints: string[];
  dependencies: string[];
  status: PlanStepStatus;
  checkpoint: boolean;
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
}

interface PlanProgressProps {
  projectId: string;
}

const statusConfig: Record<PlanStepStatus, { icon: typeof Circle; color: string; bg: string; label: string }> = {
  pending: { icon: Circle, color: "text-muted-foreground/40", bg: "bg-muted/30", label: "Pending" },
  running: { icon: Loader2, color: "text-primary", bg: "bg-primary/10", label: "Running" },
  completed: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Done" },
  failed: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
  skipped: { icon: SkipForward, color: "text-muted-foreground", bg: "bg-muted/20", label: "Skipped" },
};

function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return "";
  const end = completedAt || Date.now();
  const diffMs = end - startedAt;
  if (diffMs < 1000) return `${diffMs}ms`;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function StepItem({ step, index }: { step: PlanStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status];
  const StatusIcon = config.icon;
  const hasDetails = !!(step.output || step.error);
  const isActive = step.status === "running";

  return (
    <div
      className={`relative flex gap-3 ${
        isActive ? "bg-primary/5 border border-primary/10 rounded-lg p-3" : "p-3"
      }`}
      data-testid={`plan-step-${step.id}`}
    >
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${config.bg}`}>
          <StatusIcon
            className={`w-4 h-4 ${config.color} ${isActive ? "animate-spin" : ""}`}
          />
        </div>
        {step.checkpoint && (
          <Flag className="w-3 h-3 text-amber-500 mt-1" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-mono">
            #{index + 1}
          </span>
          <span
            className={`text-[13px] font-medium ${
              step.status === "completed"
                ? "text-foreground/80"
                : step.status === "running"
                  ? "text-foreground"
                  : step.status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground"
            }`}
            data-testid={`text-step-description-${step.id}`}
          >
            {step.description}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {step.toolHints.length > 0 && step.toolHints.map((tool) => (
            <Badge key={tool} variant="secondary" className="text-[9px] font-mono" data-testid={`badge-tool-${tool}`}>
              <Wrench className="w-2.5 h-2.5 mr-0.5" />
              {tool}
            </Badge>
          ))}

          {step.startedAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatDuration(step.startedAt, step.completedAt)}
            </span>
          )}

          <Badge
            variant="outline"
            className={`text-[9px] ${config.color}`}
            data-testid={`badge-status-${step.id}`}
          >
            {config.label}
          </Badge>
        </div>

        {hasDetails && (
          <div className="mt-1.5">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors"
              data-testid={`button-expand-step-${step.id}`}
            >
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {step.error ? "Error details" : "Output"}
            </button>

            {expanded && (
              <div
                className={`mt-1 p-2 rounded-md text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto ${
                  step.error
                    ? "bg-destructive/5 text-destructive border border-destructive/10"
                    : "bg-muted/50 text-foreground/80 border border-border"
                }`}
                data-testid={`text-step-output-${step.id}`}
              >
                {step.error || step.output}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlanProgress({ projectId }: PlanProgressProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectWebSocket = useCallback(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "plan_update" && data.projectId === projectId) {
            setPlan(data.plan);
          }
          if (data.type === "agent-event" && data.projectId === projectId && data.event?.type === "plan" && data.event?.payload) {
            const p = data.event.payload;
            if (p.steps) {
              setPlan({
                id: p.planId || "plan-" + Date.now(),
                goal: p.goal || "",
                steps: p.steps,
                createdAt: data.event.timestamp || Date.now(),
                updatedAt: Date.now(),
              });
            }
          }
        } catch {
        }
      };

      ws.onclose = () => {
        reconnectTimerRef.current = setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
    }
  }, [projectId]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch(`/api/agent/plan/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.steps) {
            setPlan(data);
          }
        }
      } catch {
      }
    };
    fetchPlan();
    const interval = setInterval(fetchPlan, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  const completedSteps = plan?.steps.filter((s) => s.status === "completed").length || 0;
  const totalSteps = plan?.steps.length || 0;
  const failedSteps = plan?.steps.filter((s) => s.status === "failed").length || 0;
  const runningStep = plan?.steps.find((s) => s.status === "running");
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  if (!plan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center" data-testid="plan-progress-empty">
        <ListChecks className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No active plan</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Start an autonomous task to see the execution plan here
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0" data-testid="plan-progress">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Plan Progress</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
          {completedSteps}/{totalSteps}
        </span>
        {failedSteps > 0 && (
          <Badge variant="destructive" className="text-[9px]" data-testid="badge-failed-count">
            {failedSteps} failed
          </Badge>
        )}
      </div>

      <div className="px-4 py-2.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-muted-foreground truncate flex-1" data-testid="text-plan-goal">
            {plan.goal}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
            {progressPercent}%
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              failedSteps > 0
                ? "bg-gradient-to-r from-destructive to-orange-400"
                : "bg-gradient-to-r from-primary to-emerald-500"
            }`}
            style={{ width: `${progressPercent}%` }}
            data-testid="progress-bar"
          />
        </div>
        {runningStep && (
          <p className="text-[11px] text-primary flex items-center gap-1 mt-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            {runningStep.description}
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          <div className="relative">
            <div className="absolute left-[18px] top-4 bottom-4 w-px bg-border" />
            <div className="space-y-0.5">
              {plan.steps.map((step, index) => (
                <StepItem key={step.id} step={step} index={index} />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
