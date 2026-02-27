import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { ProjectFile } from "@shared/schema";
import { RefreshCw, Monitor, Smartphone, Tablet, X, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreviewError {
  message: string;
  line?: number;
  col?: number;
  source?: string;
}

interface PreviewPanelProps {
  files: ProjectFile[];
  projectName: string;
  projectId?: string;
  onSendToChat?: (message: string) => void;
}

type ViewMode = "desktop" | "tablet" | "mobile";

const viewModes: { id: ViewMode; icon: typeof Monitor; label: string; width: string }[] = [
  { id: "desktop", icon: Monitor, label: "Desktop", width: "100%" },
  { id: "tablet", icon: Tablet, label: "Tablet", width: "768px" },
  { id: "mobile", icon: Smartphone, label: "Mobile", width: "375px" },
];

const ERROR_CATCHER_SCRIPT = `
<script>
(function() {
  var errors = [];
  window.onerror = function(message, source, lineno, colno, error) {
    var errObj = {
      type: 'preview-error',
      message: String(message),
      line: lineno,
      col: colno,
      source: source || ''
    };
    window.parent.postMessage(errObj, '*');
    return false;
  };
  window.addEventListener('unhandledrejection', function(event) {
    var msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise Rejection';
    window.parent.postMessage({
      type: 'preview-error',
      message: msg,
      line: 0,
      col: 0,
      source: ''
    }, '*');
  });
})();
</script>
`;

export function PreviewPanel({ files, projectName, projectId, onSendToChat }: PreviewPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data && event.data.type === "preview-error") {
      const newError: PreviewError = {
        message: event.data.message,
        line: event.data.line || undefined,
        col: event.data.col || undefined,
        source: event.data.source || undefined,
      };
      setErrors((prev) => {
        if (prev.some((e) => e.message === newError.message && e.line === newError.line)) {
          return prev;
        }
        return [...prev, newError];
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    setErrors([]);
  }, [refreshKey]);

  const previewHtml = useMemo(() => {
    const htmlFile = files.find((f) => f.path.endsWith(".html") || f.path.endsWith("index.html"));
    const cssFile = files.find((f) => f.path.endsWith(".css") || f.path.endsWith("styles.css"));
    const jsFiles = files.filter((f) =>
      (f.path.endsWith(".js")) &&
      !f.path.includes("server/") &&
      !f.path.includes("routes") &&
      !f.path.includes("package.json") &&
      f.language === "javascript"
    );

    if (!htmlFile && jsFiles.length === 0) return null;

    let html = htmlFile?.content || `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${projectName}</title></head><body><div id="root"></div></body></html>`;

    html = html.replace("<head>", `<head>${ERROR_CATCHER_SCRIPT}`);

    if (cssFile) {
      html = html.replace(
        /<link[^>]*rel="stylesheet"[^>]*>/gi,
        `<style>${cssFile.content}</style>`
      );
      if (!html.includes("<style>")) {
        html = html.replace("</head>", `<style>${cssFile.content}</style></head>`);
      }
    }

    for (const jsFile of jsFiles) {
      const fileName = jsFile.path.split("/").pop() || "";
      const scriptTagRegex = new RegExp(`<script[^>]*src="[^"]*${fileName.replace(".", "\\.")}[^"]*"[^>]*><\\/script>`, "gi");
      if (scriptTagRegex.test(html)) {
        html = html.replace(scriptTagRegex, `<script>${jsFile.content}</script>`);
      } else if (!html.includes(jsFile.content.substring(0, 50))) {
        html = html.replace("</body>", `<script>${jsFile.content}</script></body>`);
      }
    }

    return html;
  }, [files, projectName, refreshKey]);

  const dismissError = (index: number) => {
    setErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const dismissAllErrors = () => {
    setErrors([]);
  };

  const askAiToFix = (error: PreviewError) => {
    if (onSendToChat) {
      const lineInfo = error.line ? ` at line ${error.line}` : "";
      const sourceInfo = error.source ? ` in ${error.source}` : "";
      const message = `Fix this JavaScript error in the preview${sourceInfo}${lineInfo}: "${error.message}"`;
      onSendToChat(message);
    }
  };

  const currentView = viewModes.find(v => v.id === viewMode)!;

  if (!previewHtml) {
    return (
      <div className="flex-1 flex flex-col min-w-0" data-testid="preview-panel">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Live Preview</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Monitor className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground mb-1" data-testid="text-no-preview">No preview available</p>
            <p className="text-xs text-muted-foreground">
              Create a project and the AI agents will generate it automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0" data-testid="preview-panel">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Monitor className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Live Preview</span>
        <div className="flex items-center gap-1 ml-auto">
          <div className="flex items-center gap-1.5 mr-3">
            <div className={`w-1.5 h-1.5 rounded-full ${errors.length > 0 ? "bg-red-500" : "bg-emerald-500"} animate-pulse`} />
            <span className={`text-[10px] ${errors.length > 0 ? "text-red-500" : "text-emerald-500"}`} data-testid="text-preview-status">
              {errors.length > 0 ? `${errors.length} Error${errors.length > 1 ? "s" : ""}` : "Running"}
            </span>
          </div>
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-1">
            {viewModes.map((mode) => {
              const ModeIcon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  className={`p-1.5 transition-colors ${
                    viewMode === mode.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={mode.label}
                  data-testid={`button-view-${mode.id}`}
                >
                  <ModeIcon className="w-3 h-3" />
                </button>
              );
            })}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setRefreshKey((k) => k + 1)}
            data-testid="button-refresh-preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 bg-[#1a1a2e] relative flex flex-col overflow-hidden">
        <div className="flex-1 flex items-start justify-center overflow-auto p-0">
          <div
            className={`h-full transition-all duration-300 ${
              viewMode !== "desktop" ? "border-x border-border shadow-2xl" : ""
            }`}
            style={{
              width: currentView.width,
              maxWidth: "100%",
            }}
          >
            <iframe
              ref={iframeRef}
              key={refreshKey}
              srcDoc={previewHtml}
              className="w-full h-full border-0 bg-white dark:bg-[#0a0a1a]"
              sandbox="allow-scripts allow-same-origin"
              title="Project Preview"
              data-testid="iframe-preview"
            />
          </div>
        </div>

        {errors.length > 0 && (
          <div className="border-t border-red-500/30 bg-red-950/90 backdrop-blur-sm" data-testid="error-overlay">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <span className="text-xs font-medium text-red-300" data-testid="text-error-count">
                  {errors.length} Error{errors.length > 1 ? "s" : ""} Detected
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={dismissAllErrors}
                className="text-red-400 no-default-hover-elevate no-default-active-elevate"
                data-testid="button-dismiss-all-errors"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="max-h-[140px] overflow-y-auto">
              {errors.map((error, index) => (
                <div
                  key={`${error.message}-${error.line}-${index}`}
                  className="flex items-start gap-2 px-3 py-2 border-b border-red-500/10 last:border-b-0"
                  data-testid={`error-item-${index}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-red-200 font-mono truncate" data-testid={`text-error-message-${index}`}>
                      {error.message}
                    </p>
                    {error.line ? (
                      <p className="text-[10px] text-red-400/70 mt-0.5" data-testid={`text-error-line-${index}`}>
                        Line {error.line}{error.col ? `, Col ${error.col}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onSendToChat && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => askAiToFix(error)}
                        className="text-red-300 no-default-hover-elevate no-default-active-elevate"
                        title="Ask AI to Fix"
                        data-testid={`button-ask-ai-fix-${index}`}
                      >
                        <Wrench className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => dismissError(index)}
                      className="text-red-400/60 no-default-hover-elevate no-default-active-elevate"
                      title="Dismiss"
                      data-testid={`button-dismiss-error-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {viewMode !== "desktop" && (
        <div className="px-4 py-1.5 border-t border-border bg-card/30 text-center">
          <span className="text-[10px] text-muted-foreground">{currentView.label} — {currentView.width}</span>
        </div>
      )}
    </div>
  );
}
