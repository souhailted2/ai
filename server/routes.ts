import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAgentPipeline } from "./agents";
import { processChat, shouldRunPipeline, analyzeUploadedFile } from "./ai-engine";
import { processChatV3, shouldRunPipelineV3, runAgentPipelineV3, detectDialect, AGENT_V3_DEFS, runSmartPipeline, getSmartPipelineStatus, isSmartBuildActive } from "./agents-v3";
import { getLLMStatus } from "./llm-router";
import { WebSocketServer, WebSocket } from "ws";
import { insertProjectSchema, insertChatMessageSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { toolRegistry } from "./agent/tools/registry";
import { registerAllTools } from "./agent/tools/register-all";
import { createAgentLoop, getActiveLoop, removeAgentLoop } from "./agent/core/loop";
import { supervisorAgent } from "./agent/agents/supervisor";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
      const ext = path.extname(file.originalname);
      cb(null, unique + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      ".jpg", ".jpeg", ".png", ".gif", ".webp",
      ".js", ".ts", ".jsx", ".tsx", ".css", ".json",
      ".txt", ".md", ".log", ".py", ".java", ".c", ".cpp", ".xml", ".yaml", ".yml",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  function broadcast(data: any) {
    const msg = JSON.stringify(data);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  app.use("/uploads", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    next();
  }, express.static(uploadDir));

  // Projects
  app.get("/api/projects", async (_req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      broadcast({ type: "project_created", project });
      res.status(201).json(project);

      if (project.description) {
        await storage.createChatMessage({
          projectId: project.id,
          role: "user",
          content: project.description,
          agentType: null,
        });

        runAgentPipelineV3(project.id, project.description, project.name, (agentType, status, message) => {
          storage.createAgentActivity({ projectId: project.id, agentType, status, message })
            .then((activity) => broadcast({ type: "agent_update", activity }));
        }).catch((err) => console.error("Agent v3 pipeline error:", err));
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    await storage.deleteProject(req.params.id);
    await storage.deleteMemory(`memory:${req.params.id}`).catch(() => {});
    await storage.deleteMemory(`corrections:${req.params.id}`).catch(() => {});
    broadcast({ type: "project_deleted", projectId: req.params.id });
    res.status(204).send();
  });

  // Project Files
  app.get("/api/projects/:id/files", async (req, res) => {
    const files = await storage.getProjectFiles(req.params.id);
    res.json(files);
  });

  app.get("/api/files/:id", async (req, res) => {
    const file = await storage.getProjectFile(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found" });
    res.json(file);
  });

  app.put("/api/files/:id", async (req, res) => {
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ message: "Content must be a string" });
    }
    const file = await storage.updateProjectFile(req.params.id, content);
    if (!file) return res.status(404).json({ message: "File not found" });
    res.json(file);
  });

  app.post("/api/projects/:id/files", async (req, res) => {
    try {
      const projectId = req.params.id;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const { path: filePath, content, language } = req.body;
      if (!filePath || typeof filePath !== "string") {
        return res.status(400).json({ message: "File path is required" });
      }

      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      const langMap: Record<string, string> = {
        js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
        json: "json", html: "html", css: "css", md: "markdown", txt: "text",
        py: "python", java: "java", c: "c", cpp: "cpp", xml: "xml", yaml: "yaml", yml: "yaml",
      };
      const detectedLang = language || langMap[ext] || "text";

      const file = await storage.createProjectFile({
        projectId,
        path: filePath,
        content: content || "",
        language: detectedLang,
      });
      broadcast({ type: "file_created", file });
      res.status(201).json(file);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/files/:id/rename", async (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath || typeof newPath !== "string") {
      return res.status(400).json({ message: "New path is required" });
    }
    const file = await storage.renameProjectFile(req.params.id, newPath);
    if (!file) return res.status(404).json({ message: "File not found" });
    broadcast({ type: "file_renamed", file });
    res.json(file);
  });

  app.delete("/api/files/:id", async (req, res) => {
    const file = await storage.getProjectFile(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found" });
    await storage.deleteProjectFile(req.params.id);
    broadcast({ type: "file_deleted", fileId: req.params.id });
    res.status(204).send();
  });

  // Clone Project
  app.post("/api/projects/:id/clone", async (req, res) => {
    try {
      const original = await storage.getProject(req.params.id);
      if (!original) return res.status(404).json({ message: "Project not found" });

      const cloned = await storage.createProject({
        name: `${original.name} (Copy)`,
        description: original.description,
        status: original.status,
        stack: original.stack,
        architecture: original.architecture as any,
      });

      const originalFiles = await storage.getProjectFiles(req.params.id);
      for (const file of originalFiles) {
        await storage.createProjectFile({
          projectId: cloned.id,
          path: file.path,
          content: file.content,
          language: file.language,
        });
      }

      broadcast({ type: "project_created", project: cloned });
      res.status(201).json(cloned);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/projects/:id/run", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const { command } = req.body;
      if (!command || typeof command !== "string") {
        return res.status(400).json({ message: "Command is required" });
      }

      const { exportProjectToDisk, runCommand } = await import("./runner");
      const slug = await exportProjectToDisk(req.params.id);
      const outputs: any[] = [];

      const exitCode = await runCommand(slug, command, (output) => {
        outputs.push(output);
        broadcast({ type: "runner-output", projectId: req.params.id, output });
      });

      res.json({ exitCode, outputs });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Chat Messages
  app.get("/api/projects/:id/messages", async (req, res) => {
    const messages = await storage.getChatMessages(req.params.id);
    res.json(messages);
  });

  app.get("/api/v3/agents", (_req, res) => {
    res.json(AGENT_V3_DEFS);
  });

  // Chat + smart AI response + conditional pipeline (v3.0)
  app.post("/api/projects/:id/chat", async (req, res) => {
    const projectId = req.params.id;
    const { content } = req.body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const userMessage = await storage.createChatMessage({
      projectId,
      role: "user",
      content,
      agentType: null,
    });

    broadcast({ type: "message", message: userMessage });

    const chatResult = await processChatV3(projectId, content);
    const aiMessage = await storage.createChatMessage({
      projectId,
      role: "agent",
      content: chatResult.response,
      agentType: "assistant",
    });
    broadcast({ type: "message", message: aiMessage });

    res.status(201).json(userMessage);

    if ((chatResult as any).smartPipeline && chatResult.shouldBuild) {
      const buildDesc = chatResult.buildDescription || content;
      runSmartPipeline(projectId, buildDesc, (agentType, status, message) => {
        storage.createAgentActivity({
          projectId,
          agentType,
          status,
          message,
        }).then((activity) => {
          broadcast({ type: "agent_update", activity });
        });
        broadcast({ type: "smart-pipeline", projectId, phase: status, agent: agentType, message });
      }).catch((err) => {
        console.error("Smart pipeline error:", err);
      });
    } else if (chatResult.executeAutonomous && chatResult.executeTask) {
      const loop = createAgentLoop(projectId, { maxIterations: 20, timeoutMinutes: 10 });
      loop.run(chatResult.executeTask, projectId, (event) => {
        broadcast({ type: "agent-event", projectId, event });
      }).catch((err) => {
        console.error("Agent loop error:", err);
      });
    } else if (chatResult.shouldBuild) {
      const buildDesc = chatResult.buildDescription || content;
      runAgentPipelineV3(projectId, buildDesc, project.name, (agentType, status, message) => {
        storage.createAgentActivity({
          projectId,
          agentType,
          status,
          message,
        }).then((activity) => {
          broadcast({ type: "agent_update", activity });
        });
      }).catch((err) => {
        console.error("Agent v3 pipeline error:", err);
      });
    }
  });

  // File/Image Upload in Chat
  app.post("/api/projects/:id/chat/upload", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Upload failed" });
      next();
    });
  }, async (req, res) => {
    const projectId = req.params.id;
    const file = req.file;

    if (!file) return res.status(400).json({ message: "No file uploaded or file type not supported" });

    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(
      path.extname(file.originalname).toLowerCase()
    );
    const attachmentType = isImage ? "image" : "file";
    const attachmentUrl = `/uploads/${file.filename}`;
    const attachmentName = file.originalname;

    const userMessage = await storage.createChatMessage({
      projectId,
      role: "user",
      content: isImage ? `📷 ${attachmentName}` : `📎 ${attachmentName}`,
      agentType: null,
      attachmentType,
      attachmentUrl,
      attachmentName,
    });

    broadcast({ type: "message", message: userMessage });

    let fileContent: string | null = null;
    if (!isImage) {
      try {
        fileContent = fs.readFileSync(path.join(uploadDir, file.filename), "utf-8");
      } catch { }
    }

    const aiResponse = await analyzeUploadedFile(
      projectId,
      attachmentName,
      attachmentType,
      fileContent,
      file.size
    );

    const aiMessage = await storage.createChatMessage({
      projectId,
      role: "agent",
      content: aiResponse,
      agentType: "assistant",
    });
    broadcast({ type: "message", message: aiMessage });

    res.status(201).json(userMessage);
  });

  // Agent Activities
  app.get("/api/projects/:id/activities", async (req, res) => {
    const activities = await storage.getAgentActivities(req.params.id);
    res.json(activities);
  });

  app.get("/api/settings/llm", (_req, res) => {
    res.json(getLLMStatus());
  });

  registerAllTools();

  app.get("/api/agent/tools", (_req, res) => {
    res.json(toolRegistry.listTools());
  });

  app.post("/api/agent/execute", async (req, res) => {
    try {
      const { task, projectId, mode, maxIterations, timeoutMinutes } = req.body;
      if (!task || !projectId) {
        return res.status(400).json({ message: "task and projectId are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const loop = createAgentLoop(projectId, {
        maxIterations: maxIterations || 20,
        timeoutMinutes: timeoutMinutes || 10,
      });

      res.json({ status: "started", projectId, task, mode: mode || "codeact" });

      loop.run(task, projectId, (event) => {
        broadcast({ type: "agent-event", projectId, event });
      }).catch((err) => {
        console.error("Agent loop error:", err);
        broadcast({ type: "agent-event", projectId, event: { type: "error", timestamp: Date.now(), payload: { message: err.message } } });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/agent/status/:projectId", (req, res) => {
    const loop = getActiveLoop(req.params.projectId);
    if (!loop) {
      return res.json({ state: "idle", iteration: 0, maxIterations: 20, plan: null });
    }
    res.json({
      state: loop.getState(),
      iteration: loop.getIteration(),
      maxIterations: loop.getMaxIterations(),
      plan: loop.getPlan(),
    });
  });

  app.get("/api/agent/plan/:projectId", (req, res) => {
    const loop = getActiveLoop(req.params.projectId);
    if (!loop) {
      return res.json(null);
    }
    const plan = loop.getPlan();
    if (!plan) {
      return res.json(null);
    }
    res.json(plan);
  });

  app.post("/api/agent/abort/:projectId", (req, res) => {
    removeAgentLoop(req.params.projectId);
    res.json({ status: "aborted" });
  });

  app.post("/api/agent/approve/:projectId", (req, res) => {
    const loop = getActiveLoop(req.params.projectId);
    if (!loop) {
      return res.status(404).json({ message: "No active agent loop for this project" });
    }
    if (!loop.isWaitingForApproval()) {
      return res.status(400).json({ message: "Agent is not waiting for approval", state: loop.getState() });
    }
    loop.approve();
    broadcast({ type: "agent-event", projectId: req.params.projectId, event: { type: "approved", timestamp: Date.now(), payload: { message: "Plan approved by user" } } });
    res.json({ status: "approved" });
  });

  app.post("/api/agent/reject/:projectId", (req, res) => {
    const loop = getActiveLoop(req.params.projectId);
    if (!loop) {
      return res.status(404).json({ message: "No active agent loop for this project" });
    }
    if (!loop.isWaitingForApproval()) {
      return res.status(400).json({ message: "Agent is not waiting for approval", state: loop.getState() });
    }
    const { feedback } = req.body || {};
    loop.reject(feedback);
    broadcast({ type: "agent-event", projectId: req.params.projectId, event: { type: "rejected", timestamp: Date.now(), payload: { feedback, message: "Plan rejected by user" } } });
    res.json({ status: "rejected" });
  });

  app.post("/api/agent/respond/:projectId", (req, res) => {
    const loop = getActiveLoop(req.params.projectId);
    if (!loop) {
      return res.status(404).json({ message: "No active agent loop for this project" });
    }
    if (!loop.isWaitingForHuman()) {
      return res.status(400).json({ message: "Agent is not waiting for a human response", state: loop.getState() });
    }
    const { response } = req.body || {};
    if (!response || typeof response !== "string") {
      return res.status(400).json({ message: "Response is required" });
    }
    loop.respondToHuman(response);
    broadcast({ type: "agent-event", projectId: req.params.projectId, event: { type: "human-response", timestamp: Date.now(), payload: { response } } });
    res.json({ status: "response_received" });
  });

  app.get("/api/agent/supervisor/status", (_req, res) => {
    res.json(supervisorAgent.getStatus());
  });

  app.get("/api/agent/smart-pipeline/:projectId", (req, res) => {
    const status = getSmartPipelineStatus(req.params.projectId);
    if (!status) return res.json({ active: false });
    res.json({ active: true, ...status });
  });

  const snapshotsDir = path.join(process.cwd(), "workspace", "snapshots");
  if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

  app.post("/api/projects/:id/snapshot", async (req, res) => {
    try {
      const projectId = req.params.id;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const files = await storage.getProjectFiles(projectId);
      const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const name = req.body.name || `Snapshot ${new Date().toLocaleString()}`;

      const snapshot = {
        id: snapshotId,
        name,
        timestamp: Date.now(),
        projectId,
        fileCount: files.length,
        files: files.map((f) => ({ path: f.path, content: f.content, language: f.language })),
      };

      const projectSnapshotsDir = path.join(snapshotsDir, projectId);
      if (!fs.existsSync(projectSnapshotsDir)) fs.mkdirSync(projectSnapshotsDir, { recursive: true });
      fs.writeFileSync(path.join(projectSnapshotsDir, `${snapshotId}.json`), JSON.stringify(snapshot, null, 2), "utf-8");

      res.status(201).json({ id: snapshotId, name, timestamp: snapshot.timestamp, fileCount: files.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:id/snapshots", async (req, res) => {
    try {
      const projectId = req.params.id;
      const projectSnapshotsDir = path.join(snapshotsDir, projectId);
      if (!fs.existsSync(projectSnapshotsDir)) return res.json([]);

      const snapshotFiles = fs.readdirSync(projectSnapshotsDir).filter((f) => f.endsWith(".json"));
      const snapshots = [];
      for (const file of snapshotFiles) {
        try {
          const content = fs.readFileSync(path.join(projectSnapshotsDir, file), "utf-8");
          const snap = JSON.parse(content);
          snapshots.push({ id: snap.id, name: snap.name, timestamp: snap.timestamp, fileCount: snap.fileCount || 0 });
        } catch {
          continue;
        }
      }
      snapshots.sort((a: any, b: any) => b.timestamp - a.timestamp);
      res.json(snapshots);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:id/snapshot/:snapshotId/restore", async (req, res) => {
    try {
      const projectId = req.params.id;
      const snapshotId = req.params.snapshotId.replace(/[^a-zA-Z0-9_-]/g, "");
      const snapshotPath = path.join(snapshotsDir, projectId, `${snapshotId}.json`);

      if (!fs.existsSync(snapshotPath)) return res.status(404).json({ message: "Snapshot not found" });

      const content = fs.readFileSync(snapshotPath, "utf-8");
      const snapshot = JSON.parse(content);

      const existingFiles = await storage.getProjectFiles(projectId);
      for (const ef of existingFiles) {
        await storage.deleteProjectFile(ef.id);
      }

      for (const sf of snapshot.files) {
        await storage.createProjectFile({
          projectId,
          path: sf.path,
          content: sf.content,
          language: sf.language,
        });
      }

      broadcast({ type: "snapshot_restored", projectId });
      res.json({ status: "restored", fileCount: snapshot.files.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
