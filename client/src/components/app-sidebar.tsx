import { useState } from "react";
import type { Project } from "@shared/schema";
import { FolderOpen, Plus, Trash2, Copy, Cpu, ChevronDown, ChevronRight, Layers, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  projects: Project[];
  isLoading: boolean;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onCloneProject?: (id: string) => void;
}

const statusColors: Record<string, string> = {
  planning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  designing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  coding: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  testing: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  ready: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  deployed: "bg-green-500/15 text-green-600 dark:text-green-400",
};

export function Sidebar({ projects, isLoading, selectedProjectId, onSelectProject, onNewProject, onDeleteProject, onCloneProject }: SidebarProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : true;
  });

  const toggleTheme = () => {
    const html = document.documentElement;
    const newDark = !isDark;
    if (newDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    localStorage.setItem("theme", newDark ? "dark" : "light");
    setIsDark(newDark);
  };

  return (
    <div className="w-64 flex-shrink-0 h-screen flex flex-col border-r border-border bg-sidebar" data-testid="sidebar">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-sidebar-foreground truncate" data-testid="text-brand-name">
            AI Factory
          </h1>
          <p className="text-[10px] text-muted-foreground">15 Agents · Local Engine</p>
        </div>
      </div>

      <div className="p-3">
        <Button
          onClick={onNewProject}
          className="w-full justify-start gap-2"
          size="sm"
          data-testid="button-new-project"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pb-3">
          <button
            onClick={() => setProjectsExpanded(!projectsExpanded)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
            data-testid="button-toggle-projects"
          >
            {projectsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Projects ({projects.length})
          </button>

          {projectsExpanded && (
            <div className="mt-1 space-y-0.5">
              {isLoading ? (
                <div className="space-y-2 px-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-md bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <Layers className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No projects yet</p>
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className={`group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                      selectedProjectId === project.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground"
                    }`}
                    onClick={() => onSelectProject(project.id)}
                    data-testid={`button-project-${project.id}`}
                  >
                    <FolderOpen className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 ${statusColors[project.status] || ""}`}>
                          {project.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onCloneProject && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloneProject(project.id);
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                          title="Clone project"
                          data-testid={`button-clone-project-${project.id}`}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(project.id);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete project"
                        data-testid={`button-delete-project-${project.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md transition-colors hover:bg-muted/50"
          data-testid="button-toggle-theme"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-blue-500" />}
          <span className="text-[11px] text-muted-foreground">{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] text-muted-foreground">All systems local · Offline</span>
        </div>
      </div>
    </div>
  );
}
