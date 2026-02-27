import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, RotateCcw, Clock, History } from "lucide-react";

interface Snapshot {
  id: string;
  name: string;
  timestamp: number;
  fileCount: number;
}

interface SnapshotPanelProps {
  projectId: string;
}

export function SnapshotPanel({ projectId }: SnapshotPanelProps) {
  const [snapshotName, setSnapshotName] = useState("");
  const { toast } = useToast();

  const { data: snapshots = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/projects", projectId, "snapshots"],
  });

  const saveMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/snapshot`, { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "snapshots"] });
      setSnapshotName("");
      toast({ title: "Snapshot saved", description: data.name || "Version saved successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/snapshot/${snapshotId}/restore`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      toast({ title: "Snapshot restored", description: "Files restored from snapshot" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const name = snapshotName.trim() || `Snapshot ${new Date().toLocaleString()}`;
    saveMutation.mutate(name);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full" data-testid="snapshot-panel">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Version Snapshots</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {snapshots.length} saved
        </Badge>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="Snapshot name (optional)"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="text-sm"
            data-testid="input-snapshot-name"
          />
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-snapshot"
          >
            <Camera className="w-4 h-4 mr-1.5" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading snapshots...</div>
          ) : snapshots.length === 0 ? (
            <div className="py-8 text-center">
              <Camera className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No snapshots yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Save a snapshot to preserve your current file state</p>
            </div>
          ) : (
            snapshots.map((snap) => (
              <Card key={snap.id} className="p-3" data-testid={`snapshot-item-${snap.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate" data-testid={`text-snapshot-name-${snap.id}`}>
                      {snap.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatTime(snap.timestamp)}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {snap.fileCount} files
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restoreMutation.mutate(snap.id)}
                    disabled={restoreMutation.isPending}
                    data-testid={`button-restore-snapshot-${snap.id}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Restore
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
