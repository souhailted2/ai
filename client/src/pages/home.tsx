import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { Sidebar } from "@/components/app-sidebar";
import { IDEWorkspace } from "@/components/ide-workspace";
import { NewProjectDialog } from "@/components/new-project-dialog";

export default function Home() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjectId(project.id);
      setShowNewProject(false);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjectId(null);
    },
  });

  const cloneProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/projects/${id}/clone`);
      return res.json();
    },
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjectId(project.id);
    },
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-screen w-full bg-background" data-testid="home-page">
      <Sidebar
        projects={projects}
        isLoading={isLoading}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onNewProject={() => setShowNewProject(true)}
        onDeleteProject={(id) => deleteProjectMutation.mutate(id)}
        onCloneProject={(id) => cloneProjectMutation.mutate(id)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        {selectedProject ? (
          <IDEWorkspace project={selectedProject} />
        ) : (
          <WelcomeScreen onNewProject={() => setShowNewProject(true)} />
        )}
      </div>
      <NewProjectDialog
        open={showNewProject}
        onOpenChange={setShowNewProject}
        onSubmit={(data) => createProjectMutation.mutate(data)}
        isPending={createProjectMutation.isPending}
      />
    </div>
  );
}

function WelcomeScreen({ onNewProject }: { onNewProject: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background" data-testid="welcome-screen">
      <div className="text-center max-w-lg px-6">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-welcome-title">
          AI Software Factory
        </h1>
        <p className="text-muted-foreground mb-2 leading-relaxed" data-testid="text-welcome-description">
          15 AI agents work together to plan, design, code, test, secure, and deploy your applications automatically.
        </p>
        <p className="text-sm text-muted-foreground/70 mb-8">
          Fully local. Zero APIs. Arabic + English.
        </p>
        <button
          onClick={onNewProject}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-purple-600 text-white font-medium transition-all hover:opacity-90"
          data-testid="button-new-project-welcome"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create New Project
        </button>
      </div>
    </div>
  );
}
