import { useState } from "react";
import type { ProjectFile } from "@shared/schema";
import { File, FileCode, FileJson, FileText, Hash, Plus, Pencil, Trash2, MoreVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const fileIcons: Record<string, typeof File> = {
  javascript: FileCode,
  typescript: FileCode,
  json: FileJson,
  html: FileCode,
  css: FileCode,
  markdown: FileText,
  text: File,
};

const langColors: Record<string, string> = {
  javascript: "text-yellow-500",
  typescript: "text-blue-500",
  json: "text-green-500",
  html: "text-orange-500",
  css: "text-pink-500",
  markdown: "text-muted-foreground",
};

interface FileExplorerProps {
  files: ProjectFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  projectId: string;
}

export function FileExplorer({ files, selectedFileId, onSelectFile, projectId }: FileExplorerProps) {
  const { toast } = useToast();
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renamePath, setRenamePath] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);

  const createFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/files`, { path: filePath });
      return res.json();
    },
    onSuccess: (file) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      setNewFileOpen(false);
      setNewFilePath("");
      onSelectFile(file.id);
      toast({ title: "File created", description: file.path });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renameFileMutation = useMutation({
    mutationFn: async ({ id, newPath }: { id: string; newPath: string }) => {
      const res = await apiRequest("PATCH", `/api/files/${id}/rename`, { path: newPath });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      setRenameOpen(false);
      setRenameFileId(null);
      setRenamePath("");
      toast({ title: "File renamed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      setDeleteOpen(false);
      setDeleteFileId(null);
      toast({ title: "File deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleNewFile = () => {
    const trimmed = newFilePath.trim();
    if (!trimmed) return;
    createFileMutation.mutate(trimmed);
  };

  const handleRename = () => {
    const trimmed = renamePath.trim();
    if (!trimmed || !renameFileId) return;
    renameFileMutation.mutate({ id: renameFileId, newPath: trimmed });
  };

  const handleDelete = () => {
    if (!deleteFileId) return;
    deleteFileMutation.mutate(deleteFileId);
  };

  const openRenameDialog = (file: ProjectFile) => {
    setRenameFileId(file.id);
    setRenamePath(file.path);
    setRenameOpen(true);
  };

  const openDeleteDialog = (file: ProjectFile) => {
    setDeleteFileId(file.id);
    setDeleteOpen(true);
  };

  const deleteFile = files.find((f) => f.id === deleteFileId);

  const folders = new Map<string, ProjectFile[]>();
  files.forEach((f) => {
    const parts = f.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder)!.push(f);
  });

  return (
    <div className="w-56 flex-shrink-0 border-r border-border flex flex-col" data-testid="file-explorer">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground uppercase tracking-wider">Explorer</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{files.length} files</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setNewFileOpen(true)}
          data-testid="button-new-file"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {files.length === 0 ? (
            <div className="py-8 text-center">
              <File className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No files generated yet</p>
            </div>
          ) : (
            Array.from(folders.entries()).map(([folder, folderFiles]) => (
              <div key={folder} className="mb-2">
                {folder !== "/" && (
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {folder}
                  </div>
                )}
                {folderFiles.map((file) => {
                  const Icon = fileIcons[file.language] || File;
                  const colorClass = langColors[file.language] || "text-muted-foreground";
                  const fileName = file.path.split("/").pop();
                  return (
                    <div
                      key={file.id}
                      className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                        selectedFileId === file.id
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground"
                      }`}
                      data-testid={`file-item-${file.id}`}
                    >
                      <button
                        onClick={() => onSelectFile(file.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        data-testid={`button-file-${file.id}`}
                      >
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${colorClass}`} />
                        <span className="text-xs truncate">{fileName}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 invisible group-hover:visible flex-shrink-0"
                            data-testid={`button-file-actions-${file.id}`}
                          >
                            <MoreVertical className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openRenameDialog(file)} data-testid={`button-rename-${file.id}`}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDeleteDialog(file)} className="text-destructive" data-testid={`button-delete-${file.id}`}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="new-file-path">File Path</Label>
            <Input
              id="new-file-path"
              placeholder="e.g. src/components/App.tsx"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewFile()}
              data-testid="input-new-file-path"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileOpen(false)} data-testid="button-cancel-new-file">
              Cancel
            </Button>
            <Button onClick={handleNewFile} disabled={!newFilePath.trim() || createFileMutation.isPending} data-testid="button-create-file">
              {createFileMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="rename-file-path">New Path</Label>
            <Input
              id="rename-file-path"
              value={renamePath}
              onChange={(e) => setRenamePath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              data-testid="input-rename-file-path"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} data-testid="button-cancel-rename">
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renamePath.trim() || renameFileMutation.isPending} data-testid="button-confirm-rename">
              {renameFileMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete <span className="font-mono text-foreground">{deleteFile?.path}</span>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteFileMutation.isPending} data-testid="button-confirm-delete">
              {deleteFileMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
