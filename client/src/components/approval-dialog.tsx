import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, ShieldCheck, ListChecks } from "lucide-react";

interface PlanStep {
  id: string;
  description: string;
  toolHints?: string[];
}

interface ApprovalDialogProps {
  open: boolean;
  onApprove: () => void;
  onReject: (feedback?: string) => void;
  planGoal?: string;
  planSteps?: PlanStep[];
}

export function ApprovalDialog({ open, onApprove, onReject, planGoal, planSteps }: ApprovalDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const handleApprove = () => {
    setFeedback("");
    setShowFeedback(false);
    onApprove();
  };

  const handleReject = () => {
    onReject(feedback || undefined);
    setFeedback("");
    setShowFeedback(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-approval">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            Plan Approval Required
          </DialogTitle>
          <DialogDescription>
            The agent has created an execution plan and needs your approval before proceeding.
          </DialogDescription>
        </DialogHeader>

        {planGoal && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Goal</p>
            <p className="text-sm font-medium text-foreground" data-testid="text-approval-goal">{planGoal}</p>
          </div>
        )}

        {planSteps && planSteps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                {planSteps.length} Steps
              </span>
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-1.5">
                {planSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-2 text-sm p-2 rounded-md bg-card"
                    data-testid={`row-approval-step-${idx}`}
                  >
                    <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-xs">{step.description}</p>
                      {step.toolHints && step.toolHints.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.toolHints.map((hint) => (
                            <Badge key={hint} variant="secondary" className="text-[10px]">
                              {hint}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {showFeedback && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Feedback (optional)</p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe what you'd like changed..."
              className="resize-none text-sm"
              rows={3}
              data-testid="input-approval-feedback"
            />
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {!showFeedback ? (
            <>
              <Button
                variant="outline"
                onClick={() => setShowFeedback(true)}
                data-testid="button-approval-reject"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                data-testid="button-approval-approve"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Approve
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setShowFeedback(false)}
                data-testid="button-approval-back"
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                data-testid="button-approval-submit-reject"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject with Feedback
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AskHumanDialogProps {
  open: boolean;
  question: string;
  onRespond: (response: string) => void;
}

export function AskHumanDialog({ open, question, onRespond }: AskHumanDialogProps) {
  const [response, setResponse] = useState("");

  const handleSubmit = () => {
    if (response.trim()) {
      onRespond(response.trim());
      setResponse("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-ask-human">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Agent Needs Your Input
          </DialogTitle>
          <DialogDescription>
            The agent has paused and is asking you a question before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-sm text-foreground" data-testid="text-ask-human-question">{question}</p>
        </div>

        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Type your response..."
          className="resize-none text-sm"
          rows={3}
          data-testid="input-ask-human-response"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!response.trim()}
            data-testid="button-ask-human-submit"
          >
            Send Response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
