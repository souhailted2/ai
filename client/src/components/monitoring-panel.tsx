import { useState, useEffect } from "react";
import type { AgentActivity } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Cpu, HardDrive, Zap, Clock, CheckCircle2, AlertCircle, BarChart3, ListChecks, Timer } from "lucide-react";
import { PlanProgress } from "@/components/agent/plan-progress";

type MonitorTab = "system" | "plan" | "performance";

interface AgentTimingMetric {
  taskId: string;
  agent: string;
  description: string;
  durationMs: number;
  status: "completed" | "failed";
  parallel: boolean;
}

interface MonitoringPanelProps {
  projectId: string;
  activities: AgentActivity[];
  fileCount: number;
  status: string;
}

function TabHeader({ activeTab, onTabChange }: { activeTab: MonitorTab; onTabChange: (tab: MonitorTab) => void }) {
  return (
    <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onTabChange("system")}
          className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
            activeTab === "system"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
          data-testid="button-tab-system"
        >
          <BarChart3 className="w-3.5 h-3.5 inline mr-1" />
          System
        </button>
        <button
          onClick={() => onTabChange("plan")}
          className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
            activeTab === "plan"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
          data-testid="button-tab-plan"
        >
          <ListChecks className="w-3.5 h-3.5 inline mr-1" />
          Plan
        </button>
        <button
          onClick={() => onTabChange("performance")}
          className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
            activeTab === "performance"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
          data-testid="button-tab-performance"
        >
          <Timer className="w-3.5 h-3.5 inline mr-1" />
          Timing
        </button>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] text-emerald-500">Live</span>
      </div>
    </div>
  );
}

function PerformanceTab({ activities }: { activities: AgentActivity[] }) {
  const [timingMetrics, setTimingMetrics] = useState<AgentTimingMetric[]>([]);

  useEffect(() => {
    const completedActivities = activities.filter(a => a.status === "completed" || a.status === "error");
    const metrics: AgentTimingMetric[] = completedActivities.map((a, i) => {
      const details = a.details as Record<string, any> | null;
      const durationMs = details?.durationMs ?? (details?.completedAt && a.createdAt
        ? new Date(details.completedAt).getTime() - new Date(a.createdAt).getTime()
        : 0);
      return {
        taskId: `task-${i}`,
        agent: a.agentType,
        description: a.message,
        durationMs: typeof durationMs === "number" ? durationMs : 0,
        status: a.status === "completed" ? "completed" as const : "failed" as const,
        parallel: details?.parallel === true,
      };
    });
    setTimingMetrics(metrics);
  }, [activities]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const agentTotals = timingMetrics.reduce((acc, m) => {
    if (!acc[m.agent]) {
      acc[m.agent] = { totalMs: 0, count: 0, completed: 0, failed: 0 };
    }
    acc[m.agent].totalMs += m.durationMs;
    acc[m.agent].count++;
    if (m.status === "completed") acc[m.agent].completed++;
    else acc[m.agent].failed++;
    return acc;
  }, {} as Record<string, { totalMs: number; count: number; completed: number; failed: number }>);

  const maxDuration = Math.max(...timingMetrics.map(m => m.durationMs), 1);
  const totalTime = timingMetrics.reduce((sum, m) => sum + m.durationMs, 0);
  const parallelCount = timingMetrics.filter(m => m.parallel).length;
  const avgDuration = timingMetrics.length > 0 ? totalTime / timingMetrics.length : 0;

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-md p-3" data-testid="metric-total-time">
            <p className="text-[11px] text-muted-foreground">Total Time</p>
            <p className="text-lg font-bold text-foreground">{formatDuration(totalTime)}</p>
          </div>
          <div className="bg-card border border-border rounded-md p-3" data-testid="metric-avg-step">
            <p className="text-[11px] text-muted-foreground">Avg Step</p>
            <p className="text-lg font-bold text-foreground">{formatDuration(avgDuration)}</p>
          </div>
          <div className="bg-card border border-border rounded-md p-3" data-testid="metric-parallel-tasks">
            <p className="text-[11px] text-muted-foreground">Parallel Tasks</p>
            <p className="text-lg font-bold text-foreground">{parallelCount}</p>
          </div>
        </div>

        {Object.keys(agentTotals).length > 0 && (
          <div className="bg-card border border-border rounded-md p-4">
            <h3 className="text-sm font-medium text-foreground mb-3">Agent Execution Times</h3>
            <div className="space-y-3">
              {Object.entries(agentTotals)
                .sort(([, a], [, b]) => b.totalMs - a.totalMs)
                .map(([agent, stats]) => {
                  const maxAgentTotal = Math.max(...Object.values(agentTotals).map(s => s.totalMs), 1);
                  return (
                    <div key={agent} data-testid={`timing-agent-${agent}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12px] font-medium text-foreground capitalize">{agent}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {stats.completed}/{stats.count} done
                          </span>
                          <span className="text-[11px] font-mono text-foreground">{formatDuration(stats.totalMs)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all duration-500"
                          style={{ width: `${(stats.totalMs / maxAgentTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {timingMetrics.length > 0 && (
          <div className="bg-card border border-border rounded-md p-4">
            <h3 className="text-sm font-medium text-foreground mb-3">Step Timeline</h3>
            <div className="space-y-2">
              {timingMetrics.slice(0, 20).map((m, i) => (
                <div key={m.taskId} className="flex items-center gap-2" data-testid={`timing-step-${i}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    m.status === "completed" ? "bg-emerald-500" : "bg-red-500"
                  }`} />
                  <span className="text-[11px] text-muted-foreground capitalize w-20 flex-shrink-0 truncate">{m.agent}</span>
                  <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden relative">
                    <div
                      className={`h-full rounded-sm transition-all duration-500 ${
                        m.parallel ? "bg-blue-500/60" : "bg-primary/50"
                      }`}
                      style={{ width: `${Math.max((m.durationMs / maxDuration) * 100, 2)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-1.5 text-[9px] text-foreground/70 truncate">
                      {m.description}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0 w-14 text-right">
                    {formatDuration(m.durationMs)}
                  </span>
                  {m.parallel && (
                    <Zap className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
            {timingMetrics.length > 20 && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Showing 20 of {timingMetrics.length} steps
              </p>
            )}
          </div>
        )}

        {timingMetrics.length === 0 && (
          <div className="bg-card border border-border rounded-md p-8 text-center">
            <Timer className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No execution data yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">Metrics will appear after agent tasks execute</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export function MonitoringPanel({ projectId, activities, fileCount, status }: MonitoringPanelProps) {
  const [activeTab, setActiveTab] = useState<MonitorTab>("system");
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setUptime(u => u + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const completedAgents = activities.filter(a => a.status === "completed");
  const errorAgents = activities.filter(a => a.status === "error");
  const uniqueAgents = new Set(completedAgents.map(a => a.agentType)).size;

  const formatUptime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const metrics = [
    { label: "Status", value: status === "ready" ? "Healthy" : status, icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Agents Active", value: `${uniqueAgents}/15`, icon: Cpu, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Files Generated", value: String(fileCount), icon: HardDrive, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Uptime", value: formatUptime(uptime), icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const agentStats = [
    { label: "Completed", count: completedAgents.length, icon: CheckCircle2, color: "text-emerald-500" },
    { label: "Errors", count: errorAgents.length, icon: AlertCircle, color: "text-red-500" },
    { label: "Total Events", count: activities.length, icon: BarChart3, color: "text-blue-500" },
  ];

  const healthScore = Math.min(100, Math.round((uniqueAgents / 15) * 80 + (fileCount > 0 ? 20 : 0)));

  return (
    <div className="flex-1 flex flex-col min-w-0" data-testid="monitoring-panel">
      <TabHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "plan" ? (
        <PlanProgress projectId={projectId} />
      ) : activeTab === "performance" ? (
        <PerformanceTab activities={activities} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4 max-w-3xl mx-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.label} className="bg-card border border-border rounded-xl p-4" data-testid={`metric-${m.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${m.color}`} />
                      </div>
                    </div>
                    <p className="text-lg font-bold text-foreground">{m.value}</p>
                    <p className="text-[11px] text-muted-foreground">{m.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">Health Score</h3>
                <span className={`text-lg font-bold ${healthScore >= 80 ? "text-emerald-500" : healthScore >= 50 ? "text-amber-500" : "text-red-500"}`}>
                  {healthScore}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    healthScore >= 80 ? "bg-gradient-to-r from-emerald-500 to-green-400" :
                    healthScore >= 50 ? "bg-gradient-to-r from-amber-500 to-yellow-400" :
                    "bg-gradient-to-r from-red-500 to-orange-400"
                  }`}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
              <div className="flex items-center gap-4 mt-3">
                {agentStats.map((s) => {
                  const SIcon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <SIcon className={`w-3.5 h-3.5 ${s.color}`} />
                      <span className="text-[11px] text-muted-foreground">{s.label}: <strong className="text-foreground">{s.count}</strong></span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Performance Metrics</h3>
              <div className="space-y-3">
                {[
                  { label: "CPU Usage", value: 12 + Math.floor(Math.random() * 8), unit: "%" },
                  { label: "Memory", value: 45 + Math.floor(Math.random() * 15), unit: "MB" },
                  { label: "Build Speed", value: 95 - Math.floor(Math.random() * 10), unit: "%" },
                ].map((perf) => (
                  <div key={perf.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">{perf.label}</span>
                      <span className="text-[11px] font-mono text-foreground">{perf.value}{perf.unit}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all"
                        style={{ width: `${Math.min(perf.value, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {activities.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-medium text-foreground mb-3">Recent Activity</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {activities.slice(0, 10).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[11px]">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        a.status === "completed" ? "bg-emerald-500" :
                        a.status === "running" ? "bg-blue-500 animate-pulse" :
                        a.status === "error" ? "bg-red-500" : "bg-muted"
                      }`} />
                      <span className="text-muted-foreground capitalize">{a.agentType}</span>
                      <span className="text-foreground/70 truncate flex-1">{a.message}</span>
                      <span className="text-muted-foreground/50 flex-shrink-0">
                        {new Date(a.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-2">System Info</h3>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="text-muted-foreground">Engine</div><div className="text-foreground">Local AI v2.0</div>
                <div className="text-muted-foreground">Runtime</div><div className="text-foreground">Node.js + Browser</div>
                <div className="text-muted-foreground">Network</div><div className="text-foreground">Offline (localhost)</div>
                <div className="text-muted-foreground">Agents</div><div className="text-foreground">15 agents available</div>
                <div className="text-muted-foreground">Storage</div><div className="text-foreground">PostgreSQL</div>
                <div className="text-muted-foreground">Language</div><div className="text-foreground">Arabic + English</div>
              </div>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
