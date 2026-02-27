import type { ProjectFile } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, FileCode, Save, X, SplitSquareHorizontal } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Editor from "@monaco-editor/react";

interface OpenTab {
  fileId: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface CodeViewerProps {
  files: ProjectFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string | null) => void;
  projectId: string;
  splitMode?: boolean;
  onToggleSplit?: () => void;
}

function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    xml: "xml",
    svg: "xml",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
  };
  return map[ext] || "plaintext";
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function EditorPane({
  files,
  selectedFileId,
  onSelectFile,
  projectId,
  openTabs,
  setOpenTabs,
  paneId,
}: {
  files: ProjectFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string | null) => void;
  projectId: string;
  openTabs: OpenTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  paneId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const isDark = useIsDark();

  const activeTab = openTabs.find((t) => t.fileId === selectedFileId);
  const activeFile = files.find((f) => f.id === selectedFileId);

  useEffect(() => {
    if (selectedFileId && !openTabs.find((t) => t.fileId === selectedFileId)) {
      const file = files.find((f) => f.id === selectedFileId);
      if (file) {
        setOpenTabs((prev) => [
          ...prev,
          {
            fileId: file.id,
            content: file.content,
            originalContent: file.content,
            isDirty: false,
          },
        ]);
      }
    }
  }, [selectedFileId, files]);

  useEffect(() => {
    for (const file of files) {
      setOpenTabs((prev) =>
        prev.map((tab) => {
          if (tab.fileId === file.id && !tab.isDirty && tab.originalContent !== file.content) {
            return {
              ...tab,
              content: file.content,
              originalContent: file.content,
            };
          }
          return tab;
        })
      );
    }
  }, [files]);

  const saveFile = useCallback(
    async (fileId: string, content: string) => {
      setSaving(true);
      try {
        await apiRequest("PUT", `/api/files/${fileId}`, { content });
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.fileId === fileId
              ? { ...tab, originalContent: content, isDirty: false }
              : tab
          )
        );
        queryClient.invalidateQueries({
          queryKey: ["/api/projects", projectId, "files"],
        });
      } catch (err: any) {
        toast({
          title: "Save failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [projectId, toast]
  );

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      if (!selectedFileId || value === undefined) return;
      const tab = openTabs.find((t) => t.fileId === selectedFileId);
      if (!tab) return;

      const isDirty = value !== tab.originalContent;
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.fileId === selectedFileId ? { ...t, content: value, isDirty } : t
        )
      );

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (isDirty) {
          saveFile(selectedFileId, value);
        }
      }, 2000);
    },
    [selectedFileId, openTabs, saveFile]
  );

  const handleCloseTab = useCallback(
    (fileId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenTabs((prev) => {
        const remaining = prev.filter((t) => t.fileId !== fileId);
        if (selectedFileId === fileId) {
          onSelectFile(remaining.length > 0 ? remaining[remaining.length - 1].fileId : null);
        }
        return remaining;
      });
    },
    [selectedFileId, onSelectFile]
  );

  const handleSave = useCallback(() => {
    if (activeTab && activeTab.isDirty) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveFile(activeTab.fileId, activeTab.content);
    }
  }, [activeTab, saveFile]);

  useEffect(() => {
    const handleIdeSave = () => handleSave();
    window.addEventListener("ide-save", handleIdeSave);
    return () => window.removeEventListener("ide-save", handleIdeSave);
  }, [handleSave]);

  const handleCopy = async () => {
    if (!activeTab) return;
    await navigator.clipboard.writeText(activeTab.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const monacoLanguage = useMemo(
    () => (activeFile ? getMonacoLanguage(activeFile.path) : "plaintext"),
    [activeFile]
  );

  const handleEditorMount = useCallback(
    (editor: any) => {
      editor.addCommand(
        2048 + 49,
        () => {
          if (activeTab && activeTab.isDirty) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            saveFile(activeTab.fileId, activeTab.content);
          }
        }
      );
    },
    [activeTab, saveFile]
  );

  if (!selectedFileId && openTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background" data-testid={`code-pane-empty-${paneId}`}>
        <div className="text-center">
          <FileCode className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">Select a file to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background" data-testid={`code-pane-${paneId}`}>
      <div className="flex items-center border-b border-border bg-card/30 overflow-x-auto flex-shrink-0">
        <ScrollArea className="flex-1">
          <div className="flex">
            {openTabs.map((tab) => {
              const file = files.find((f) => f.id === tab.fileId);
              if (!file) return null;
              const isActive = tab.fileId === selectedFileId;
              const fileName = file.path.split("/").pop() || file.path;
              return (
                <button
                  key={tab.fileId}
                  onClick={() => onSelectFile(tab.fileId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border-r border-border whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-background text-foreground"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`tab-file-${paneId}-${tab.fileId}`}
                >
                  {tab.isDirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" data-testid={`indicator-unsaved-${paneId}-${tab.fileId}`} />
                  )}
                  <span className="truncate max-w-[120px]">{fileName}</span>
                  <span
                    onClick={(e) => handleCloseTab(tab.fileId, e)}
                    className="ml-1 p-0.5 rounded-sm text-muted-foreground/60 hover-elevate"
                    data-testid={`button-close-tab-${paneId}-${tab.fileId}`}
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {activeTab && activeFile && (
        <>
          <div className="flex items-center justify-between gap-1 px-4 py-1.5 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <FileCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-mono text-foreground truncate">{activeFile.path}</span>
              <Badge variant="secondary" className="text-[10px]">
                {activeFile.language}
              </Badge>
              {activeTab.isDirty && (
                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                  Modified
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSave}
                disabled={!activeTab.isDirty || saving}
                data-testid={`button-save-file-${paneId}`}
              >
                <Save className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCopy}
                data-testid={`button-copy-code-${paneId}`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0" data-testid={`input-code-editor-${paneId}`}>
            <Editor
              height="100%"
              language={monacoLanguage}
              theme={isDark ? "vs-dark" : "light"}
              value={activeTab.content}
              onChange={handleContentChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 12,
                fontFamily: "monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                renderLineHighlight: "line",
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                padding: { top: 8 },
              }}
            />
          </div>
        </>
      )}

      {!activeTab && openTabs.length > 0 && (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <FileCode className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Select a tab to continue editing</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeViewer({ files, selectedFileId, onSelectFile, projectId, splitMode, onToggleSplit }: CodeViewerProps) {
  const [openTabsLeft, setOpenTabsLeft] = useState<OpenTab[]>([]);
  const [openTabsRight, setOpenTabsRight] = useState<OpenTab[]>([]);
  const [rightSelectedFileId, setRightSelectedFileId] = useState<string | null>(null);

  if (splitMode) {
    return (
      <div className="flex-1 flex flex-col min-w-0" data-testid="code-viewer-split">
        <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-border bg-card/30 flex-shrink-0">
          <span className="text-xs text-muted-foreground font-medium px-1">Split Editor</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggleSplit}
            data-testid="button-close-split"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex flex-1 min-h-0">
          <EditorPane
            files={files}
            selectedFileId={selectedFileId}
            onSelectFile={onSelectFile}
            projectId={projectId}
            openTabs={openTabsLeft}
            setOpenTabs={setOpenTabsLeft}
            paneId="left"
          />
          <div className="w-px bg-border flex-shrink-0" />
          <EditorPane
            files={files}
            selectedFileId={rightSelectedFileId}
            onSelectFile={setRightSelectedFileId}
            projectId={projectId}
            openTabs={openTabsRight}
            setOpenTabs={setOpenTabsRight}
            paneId="right"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0" data-testid="code-viewer">
      <EditorPane
        files={files}
        selectedFileId={selectedFileId}
        onSelectFile={onSelectFile}
        projectId={projectId}
        openTabs={openTabsLeft}
        setOpenTabs={setOpenTabsLeft}
        paneId="main"
      />
    </div>
  );
}
