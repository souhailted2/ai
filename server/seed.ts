import { storage } from "./storage";

export async function seedDatabase() {
  const existingProjects = await storage.getProjects();
  if (existingProjects.length > 0) return;

  // Seed project 1
  const project1 = await storage.createProject({
    name: "Task Manager",
    description: "A kanban-style task management application with drag and drop, categories, and due dates",
    status: "ready",
    stack: "react-tasks",
    architecture: { type: "task-management", layers: ["components", "pages", "api", "models"] },
  });

  await storage.createProjectFile({ projectId: project1.id, path: "package.json", content: '{\n  "name": "task-manager",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "node src/index.js",\n    "start": "node src/index.js"\n  },\n  "dependencies": {\n    "express": "^4.18.0",\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  }\n}', language: "json" });
  await storage.createProjectFile({ projectId: project1.id, path: "src/index.html", content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Task Manager</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <div id="root"></div>\n  <script src="app.js"></script>\n</body>\n</html>', language: "html" });
  await storage.createProjectFile({ projectId: project1.id, path: "src/app.js", content: 'function init() {\n  const root = document.getElementById("root");\n  root.innerHTML = `<div class="header"><h1>Task Manager</h1></div><div class="main"><div class="card"><h2>Welcome</h2><p>Kanban task management app</p></div></div>`;\n}\n\ndocument.addEventListener("DOMContentLoaded", init);', language: "javascript" });
  await storage.createProjectFile({ projectId: project1.id, path: "src/styles.css", content: '* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: sans-serif; background: #0f172a; color: #e2e8f0; }\n.header { padding: 1rem 2rem; background: #1e293b; border-bottom: 1px solid #334155; }\n.main { padding: 2rem; }\n.card { background: #1e293b; border-radius: 12px; padding: 1.5rem; border: 1px solid #334155; }', language: "css" });

  await storage.createChatMessage({ projectId: project1.id, role: "user", content: "Build a kanban-style task management application with drag and drop, categories, and due dates", agentType: null });
  await storage.createChatMessage({ projectId: project1.id, role: "agent", agentType: "planner", content: "Project analysis complete!\n\nStack: react-tasks\nFeatures identified: Task CRUD, Categories, Due dates, Status tracking\nArchitecture: task-management\nLayers: components > pages > api > models" });
  await storage.createChatMessage({ projectId: project1.id, role: "agent", agentType: "developer", content: "Code generation complete!\n\nGenerated 4 files:\n  package.json (json)\n  src/index.html (html)\n  src/app.js (javascript)\n  src/styles.css (css)" });
  await storage.createChatMessage({ projectId: project1.id, role: "agent", agentType: "deployer", content: 'Deployment ready!\n\nProject "Task Manager" is built and ready.\n\nTo run locally:\n```\nnpm install\nnpm run dev\n```' });

  await storage.createAgentActivity({ projectId: project1.id, agentType: "planner", status: "completed", message: "Identified 4 features, stack: react-tasks" });
  await storage.createAgentActivity({ projectId: project1.id, agentType: "architect", status: "completed", message: "Created 10 directories and files" });
  await storage.createAgentActivity({ projectId: project1.id, agentType: "developer", status: "completed", message: "Generated 4 source files" });
  await storage.createAgentActivity({ projectId: project1.id, agentType: "debugger", status: "completed", message: "No critical issues found" });
  await storage.createAgentActivity({ projectId: project1.id, agentType: "optimizer", status: "completed", message: "Applied 5 optimizations" });
  await storage.createAgentActivity({ projectId: project1.id, agentType: "deployer", status: "completed", message: "Project ready for deployment" });

  // Seed project 2
  const project2 = await storage.createProject({
    name: "Blog API",
    description: "A RESTful API for a blog platform with posts, comments, and user authentication",
    status: "coding",
    stack: "express-api",
    architecture: { type: "backend-api", layers: ["routes", "controllers", "models", "middleware"] },
  });

  await storage.createProjectFile({ projectId: project2.id, path: "package.json", content: '{\n  "name": "blog-api",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "node src/index.js"\n  },\n  "dependencies": {\n    "express": "^4.18.0"\n  }\n}', language: "json" });
  await storage.createProjectFile({ projectId: project2.id, path: "src/index.js", content: 'const express = require("express");\nconst app = express();\nconst PORT = 3000;\n\napp.use(express.json());\n\napp.get("/api/health", (req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(PORT, () => {\n  console.log(`Blog API running on port ${PORT}`);\n});', language: "javascript" });

  await storage.createChatMessage({ projectId: project2.id, role: "user", content: "Create a REST API for a blog with posts and comments", agentType: null });
  await storage.createChatMessage({ projectId: project2.id, role: "agent", agentType: "planner", content: "Project analysis complete!\n\nStack: express-api\nFeatures: REST API, JSON responses, Error handling\nArchitecture: backend-api" });

  await storage.createAgentActivity({ projectId: project2.id, agentType: "planner", status: "completed", message: "Identified 3 features, stack: express-api" });
  await storage.createAgentActivity({ projectId: project2.id, agentType: "architect", status: "completed", message: "Created 8 directories and files" });
  await storage.createAgentActivity({ projectId: project2.id, agentType: "developer", status: "running", message: "Generating source code..." });

  console.log("Database seeded with sample projects");
}
