import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  FileCode,
  Save,
  Play,
  Terminal,
  FolderTree,
  MessageSquare,
  Monitor,
  BarChart3,
  Activity,
  SplitSquareHorizontal,
  Camera,
  Search,
} from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: typeof FileCode;
  shortcut?: string;
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter(
      (cmd) =>
        fuzzyMatch(query, cmd.label) ||
        fuzzyMatch(query, cmd.description || "") ||
        fuzzyMatch(query, cmd.category)
    );
  }, [query, commands]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    for (const cmd of filtered) {
      if (!groups.has(cmd.category)) groups.set(cmd.category, []);
      groups.get(cmd.category)!.push(cmd);
    }
    return groups;
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      onOpenChange(false);
      setTimeout(() => cmd.action(), 50);
    },
    [onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        }
      }
    },
    [filtered, selectedIndex, executeCommand]
  );

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg" data-testid="command-palette">
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="border-0 focus-visible:ring-0 text-sm"
            data-testid="input-command-search"
          />
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="text-no-commands">
              No commands found
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {category}
                </div>
                {items.map((cmd) => {
                  const globalIdx = filtered.indexOf(cmd);
                  const Icon = cmd.icon;
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-index={globalIdx}
                      onClick={() => executeCommand(cmd)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                        isSelected ? "bg-accent text-accent-foreground" : "text-foreground"
                      }`}
                      data-testid={`command-item-${cmd.id}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getDefaultCommands(options: {
  onSwitchPanel: (panel: string) => void;
  onSaveFile: () => void;
  onNewFile: () => void;
  onToggleSplit: () => void;
  onSaveSnapshot: () => void;
}): CommandItem[] {
  return [
    {
      id: "switch-chat",
      label: "Switch to AI Chat",
      icon: MessageSquare,
      shortcut: "Ctrl+1",
      category: "Navigation",
      action: () => options.onSwitchPanel("chat"),
    },
    {
      id: "switch-preview",
      label: "Switch to Preview",
      icon: Monitor,
      shortcut: "Ctrl+2",
      category: "Navigation",
      action: () => options.onSwitchPanel("preview"),
    },
    {
      id: "switch-files",
      label: "Switch to Files",
      icon: FolderTree,
      shortcut: "Ctrl+3",
      category: "Navigation",
      action: () => options.onSwitchPanel("files"),
    },
    {
      id: "switch-code",
      label: "Switch to Code Editor",
      icon: FileCode,
      shortcut: "Ctrl+4",
      category: "Navigation",
      action: () => options.onSwitchPanel("code"),
    },
    {
      id: "switch-agents",
      label: "Switch to Agents",
      icon: Activity,
      shortcut: "Ctrl+5",
      category: "Navigation",
      action: () => options.onSwitchPanel("agents"),
    },
    {
      id: "switch-monitoring",
      label: "Switch to Monitoring",
      icon: BarChart3,
      shortcut: "Ctrl+6",
      category: "Navigation",
      action: () => options.onSwitchPanel("monitoring"),
    },
    {
      id: "switch-terminal",
      label: "Switch to Terminal",
      icon: Terminal,
      shortcut: "Ctrl+7",
      category: "Navigation",
      action: () => options.onSwitchPanel("terminal"),
    },
    {
      id: "save-file",
      label: "Save Current File",
      icon: Save,
      shortcut: "Ctrl+S",
      category: "Editor",
      action: options.onSaveFile,
    },
    {
      id: "new-file",
      label: "New File",
      icon: FileCode,
      shortcut: "Ctrl+N",
      category: "Editor",
      action: options.onNewFile,
    },
    {
      id: "split-editor",
      label: "Toggle Split Editor",
      icon: SplitSquareHorizontal,
      category: "Editor",
      action: options.onToggleSplit,
    },
    {
      id: "save-snapshot",
      label: "Save Version Snapshot",
      icon: Camera,
      category: "Version Control",
      action: options.onSaveSnapshot,
    },
  ];
}
