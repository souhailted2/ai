import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Gamepad2, LayoutDashboard, ShoppingCart, CheckSquare, MessageCircle, Code2, Globe, Calculator } from "lucide-react";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description: string }) => void;
  isPending: boolean;
}

const templates = [
  { icon: Gamepad2, name: "Snake Game", desc: "Build a snake game", color: "text-green-500" },
  { icon: LayoutDashboard, name: "Dashboard", desc: "Create a management dashboard with charts and statistics", color: "text-blue-500" },
  { icon: ShoppingCart, name: "E-Commerce", desc: "Build an e-commerce store with product catalog and cart", color: "text-orange-500" },
  { icon: CheckSquare, name: "Task Manager", desc: "Build a task management app with kanban boards", color: "text-purple-500" },
  { icon: MessageCircle, name: "Chat App", desc: "Create a real-time chat application with rooms", color: "text-cyan-500" },
  { icon: Code2, name: "REST API", desc: "Create a REST API for a blog with posts and comments", color: "text-yellow-500" },
  { icon: Globe, name: "Landing Page", desc: "Build a modern landing page with hero and features", color: "text-pink-500" },
  { icon: Calculator, name: "Calculator", desc: "Build a scientific calculator app", color: "text-teal-500" },
];

export function NewProjectDialog({ open, onOpenChange, onSubmit, isPending }: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() });
    setName("");
    setDescription("");
  };

  const selectTemplate = (t: typeof templates[0]) => {
    setName(t.name);
    setDescription(t.desc);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            New Project
          </DialogTitle>
          <DialogDescription>
            Describe your idea in Arabic or English. The 15 AI agents will build it automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome App"
              data-testid="input-project-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-desc">Describe Your Idea</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what you want to build... أو اكتب بالعربي"
              rows={3}
              className="resize-none"
              data-testid="input-project-description"
            />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-2 font-medium">Project Templates</p>
            <div className="grid grid-cols-4 gap-2">
              {templates.map((t, i) => {
                const TIcon = t.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectTemplate(t)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-card transition-all hover:border-primary/40 hover:bg-primary/5"
                    data-testid={`button-template-${i}`}
                  >
                    <TIcon className={`w-5 h-5 ${t.color}`} />
                    <span className="text-[11px] text-foreground font-medium text-center leading-tight">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Arabic examples:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { ar: "أنشئ لعبة الثعبان", name: "Snake Game" },
                { ar: "أنشئ لوحة تحكم لإدارة المصنع", name: "Factory Dashboard" },
                { ar: "أنشئ متجر إلكتروني", name: "Online Store" },
                { ar: "أنشئ آلة حاسبة", name: "Calculator" },
              ].map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDescription(ex.ar);
                    if (!name) setName(ex.name);
                  }}
                  className="text-[11px] px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
                  dir="rtl"
                  data-testid={`button-arabic-example-${i}`}
                >
                  {ex.ar}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-project"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !description.trim() || isPending}
              data-testid="button-create-project"
            >
              {isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
