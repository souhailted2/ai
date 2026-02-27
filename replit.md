# Personal AI Software Factory

## Overview
A local AI-powered software development platform where users describe app ideas and AI agents automatically analyze, design, code, test, and deploy projects. Runs entirely locally with no external API dependencies (cloud LLM optional). Supports Algerian dialect (دارجة), Arabic, French, and English input.

**Version: v5.0 "God Mode" — Autonomous Software Company**

## Architecture
- **Frontend**: React + TypeScript + TailwindCSS (dark/light mode IDE theme)
- **Backend**: Express + WebSocket for real-time updates
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: Local rule-based code generation engine (no external APIs required)
- **Editor**: Monaco Editor with syntax highlighting, multi-tab support, split editor view
- **LLM Mode**: Offline (default) or Cloud (GROQ/OpenAI) via environment variables
- **CodeAct Engine** (v4.1): Generates executable JS code using tool registry, runs in vm sandbox
- **Agent Loop** (v5.0): Approval-gated autonomous execution with ReAct think-act pattern, stuck detection, AskHuman support
- **Enhanced Memory** (v5.0): 4-layer hierarchical memory + self-learning from builds + pattern extraction
- **Supervisor Agent** (v5.0): AI CEO that decomposes complex goals, assigns agents, monitors progress
- **Smart Pipeline** (v5.0): Full autonomous pipeline: Idea → Plan → Architecture → Code → Run → Preview → Improve

## Data Model
- `projects` - User projects with status tracking
- `projectFiles` - Generated source code files per project
- `chatMessages` - Chat conversation between user and AI agents
- `agentActivities` - Pipeline status for each agent step
- `memories` - Persistent key-value store for MemoryKeeper (survives server restarts)

## v3.1 Agent System (6 Conversational Agents)
1. **ChattyCoordinator** - Central entry point. Detects dialect (dz/ar/en/fr), classifies 28 intents (with TECH_SCORE system for external library questions), asks clarifying questions, maintains conversation memory.
2. **SmartAnalyzer** - Analyzes requests, produces structured ProjectSpec with confidence scoring.
3. **CollaborativeCoder** - Wraps code generation engine, explains approach before building.
4. **Runner** - Exports project to disk, runs safe npm commands via allowlist, streams output.
5. **FriendlyDebugger** - Diagnoses errors, suggests fixes, asks before applying changes.
6. **MemoryKeeper** - Tracks conversation context, user preferences, persists to PostgreSQL.

## TECH_SCORE Intent Classification System
- Located in `server/agents-v3.ts`, function `computeTechScore(text)`
- Prevents technical questions about external libraries from being misclassified as "improve"
- 4 signal categories: Framework names (+3), Programming concepts (+2), Question patterns (+2), Code tokens (+1)
- Threshold: score >= 5 → classified as "question" intent
- Fires before explainWords, fixWords, and improveWords checks in `classifyIntentOffline()`
- `handleQuestion()` is async — fallback chain: LLM cloud → StackOverflow API search → offline static
- `answerTechQuestion()` in `server/llm-router.ts` uses LLM with senior engineer system prompt (temp 0.4)
- `searchTechQuestion()` in Research Agent uses StackOverflow API (free, no API key) — fetches top questions + best answer
- `SAFE_INTERNET_MODE=true` env var enables Research Agent internet mode (DuckDuckGo for best practices, StackOverflow for tech questions)
- DuckDuckGo HTML search uses POST method with browser-like headers (`server/agent/tools/implementations/web.ts`)

## v5.0 Specialized Agents (6 New)
7. **Supervisor Agent (AI CEO)** (`server/agent/agents/supervisor.ts`) - Meta-agent coordinator. Decomposes complex goals into sub-tasks, assigns to specialized agents, monitors progress, suggests system improvements. Offline: keyword-based routing. Cloud: LLM-enhanced decomposition.
8. **Research Agent** (`server/agent/agents/research.ts`) - Safe internet mode. Searches local docs, analyzes GitHub repos, searches best practices. Online mode toggleable via `SAFE_INTERNET_MODE` env var. All results shown before applying.
9. **Tool Builder Agent** (`server/agent/agents/tool-builder.ts`) - Auto-generates internal tools. Creates JS tool implementations, validates with Zod, registers in ToolRegistry. Stores in `workspace/custom-tools/`. Sandboxed to workspace only.
10. **UI Designer Agent** (`server/agent/agents/ui-designer.ts`) - Generates layouts (dashboard, landing, form, card grid, sidebar), suggests UX improvements, creates color schemes. Template-based offline, LLM-enhanced cloud.
11. **Refactor Agent** (`server/agent/agents/refactor.ts`) - Analyzes code smells, suggests refactoring, modernizes patterns (var→const, callback→async/await). Regex-based offline, LLM-powered cloud.
12. **Memory Agent** (`server/agent/agents/memory-agent.ts`) - Dedicated agent for self-learning. Extracts patterns from builds, summarizes sessions, suggests approaches from history.

## v5.0 Approval-Gated Autonomous Loop
- **States**: idle → analyzing → planning → proposing → waiting_approval → approved → executing → observing → correcting → complete
- **Approval Gate**: After planning, emits plan via WebSocket, waits for user approval before executing
- **ReAct Pattern**: think→act cycle for each step (from OpenManus)
- **Stuck Detection**: Tracks last N actions, forces replan if duplicated
- **AskHuman**: Agent can pause and ask user questions mid-execution (5-min timeout)
- **Endpoints**: `POST /api/agent/approve/:projectId`, `POST /api/agent/reject/:projectId`, `POST /api/agent/respond/:projectId`

## v5.0 Tool Registry (15 Tools)
Original 8: shell, readFile, writeFile, listFiles, deleteFile, searchWeb, fetchUrl, codeExec
New 7: planning (CRUD plans), strReplaceEditor (surgical file editing), researchDocs, researchGitHub, researchWeb, createTool, askHuman

## v5.0 Smart Pipeline (`server/agent/pipelines/smart-pipeline.ts`)
- Phases: idea → decomposition → planning → execution → improvement → complete
- Supervisor decomposes, each phase assigned to appropriate agent(s)
- After generation, suggests improvements based on memory
- Session summarization after completion
- WebSocket live progress updates

## v5.0 IDE Enhancements
- **Split Editor**: Side-by-side file viewing/editing (horizontal split)
- **Command Palette**: Ctrl+Shift+P searchable command list with fuzzy search
- **Version Snapshots**: Save/restore file state snapshots (stored in scratchpad)
- **Approval Dialog**: Modal for approving/rejecting agent plans
- **AskHuman Dialog**: Highlighted question display with response textarea
- **Performance Monitoring**: Agent execution times tracking

## v5.0 Enhanced Prompts (`server/agent/prompts/`)
- `roles.ts` - Role-specific system prompts with capabilities for all agent types
- `manus.ts` - OpenManus-inspired prompt templates (SYSTEM_PROMPT, NEXT_STEP_PROMPT, PLANNING_PROMPT, CODE_GENERATION_PROMPT)
- Full JSON schema tool descriptions for LLM consumption

## v5.0 Self-Learning Memory
- `learnFromBuild()` - Stores successful architecture patterns
- `getPreferredStack()` - Returns user's most-used tech stacks
- `getSuccessfulPatterns()` - Returns architectures that worked before
- `extractPatterns()` - Identifies recurring patterns across builds
- Memory cap: 50MB with auto-compression

## v5.0 Performance Mode
- Parallel agent execution where tasks are independent
- WebSocket live updates for parallel streams
- Non-blocking UI with optimistic updates
- Performance metrics tracking

## Safety Constraints (User-Approved)
- MAX_PARALLEL_AGENTS=2
- Tool Builder sandboxed to workspace-only
- Memory cap 50MB with auto-compression
- Research Agent read-only, never auto-imports
- Stability over speed
- NEVER self-modify without user permission

## 28 Intents
Original 18: greeting, thanks, help, status, explain-code, fix-error, improve, add-feature, change-style, rebuild, translate, document, question, build-new, affirmative, negative, use-image, unknown
v3.1 additions (9): show-files, open-file, edit-file, run, deploy, settings, cancel, reset, summarize
v4.1 addition (1): execute (triggers autonomous agent loop)

## Language Support
- **Algerian dialect (دارجة)**: واش, كيفاش, بزاف, خدمة, بصح, نحب, راني, وين, علاش, كاين, ماكاش, صحيت, كيراك, لاباس, ديرلي, نديرو
- **Modern Standard Arabic**: Full MSA support
- **French**: Bonjour, merci, créer, ajouter
- **English**: Full English support
- Dialect priority: dz > fr > ar > en

## Cloud-Optional LLM Mode (v4)
- **Offline (default)**: All classification and analysis via local rules
- **Cloud mode**: Set `LLM_MODE=cloud` + provide `GROQ_API_KEY` or `OPENAI_API_KEY`
- Silent fallback to offline on any cloud error

## Legacy v2.0 Pipeline (Preserved)
Vision → Planner → Architect → UI Designer → Backend → Frontend → Developer → Debug → Test → Optimizer → Security → Docs → Memory → Deployer → Monitor

**Code generation functions are NEVER modified**: generateSnakeGame, generateCalculator, generateDashboard, generateTodoApp, generateEcommerce, generateLandingPage, generateApiProject, generateGenericApp

## Supported Project Types
- Snake game (Arabic: دودة/ثعبان)
- Dashboard / management platform
- E-commerce store
- Task manager / kanban
- Calculator (Arabic: آلة حاسبة)
- REST API
- Landing page / portfolio
- Generic apps

## API Routes
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project (triggers v3 agent pipeline)
- `DELETE /api/projects/:id` - Delete project + cascade
- `POST /api/projects/:id/clone` - Clone project with all files
- `POST /api/projects/:id/run` - Run command in project (Runner)
- `GET /api/projects/:id/files` - List project files
- `POST /api/projects/:id/files` - Create new file
- `GET /api/files/:id` - Get single file
- `PUT /api/files/:id` - Update file content
- `PATCH /api/files/:id/rename` - Rename file
- `DELETE /api/files/:id` - Delete file
- `GET /api/projects/:id/messages` - Get chat messages
- `POST /api/projects/:id/chat` - Send chat message (v3 coordinator)
- `POST /api/projects/:id/chat/upload` - Upload file/image in chat
- `GET /api/projects/:id/activities` - Get agent activities
- `GET /api/v3/agents` - Get v3 agent definitions
- `GET /api/settings/llm` - Check LLM mode status
- `POST /api/agent/execute` - Execute autonomous agent loop
- `GET /api/agent/status/:projectId` - Get agent loop state
- `GET /api/agent/tools` - List registered tools (15 total)
- `POST /api/agent/plan` - Generate execution plan
- `POST /api/agent/approve/:projectId` - Approve agent plan
- `POST /api/agent/reject/:projectId` - Reject agent plan with feedback
- `POST /api/agent/respond/:projectId` - Respond to AskHuman question
- `GET /api/agent/supervisor/status` - Get Supervisor agent status
- `POST /api/projects/:id/snapshot` - Save version snapshot
- `GET /api/projects/:id/snapshots` - List snapshots
- `POST /api/projects/:id/snapshot/:snapshotId/restore` - Restore from snapshot

## Key Files
- `shared/schema.ts` - Database schema and types
- `server/agents-v3.ts` - v3.1 6-agent conversational system
- `server/agents.ts` - Legacy 15-agent pipeline + code generation (DO NOT MODIFY code gen)
- `server/llm-router.ts` - Cloud-optional LLM router
- `server/runner.ts` - Backend Runner service
- `server/ai-engine.ts` - Chat routing layer
- `server/routes.ts` - API routes + WebSocket
- `server/storage.ts` - Database storage layer
- `server/agent/core/loop.ts` - v5.0 Approval-gated autonomous loop
- `server/agent/core/planner.ts` - Dynamic planner with checkpoints
- `server/agent/core/codeact.ts` - CodeAct engine (JS code gen + vm execution)
- `server/agent/tools/registry.ts` - Tool registry (15 tools)
- `server/agent/tools/register-all.ts` - Tool registration
- `server/agent/agents/supervisor.ts` - Supervisor Agent (AI CEO)
- `server/agent/agents/research.ts` - Research Agent
- `server/agent/agents/tool-builder.ts` - Tool Builder Agent
- `server/agent/agents/ui-designer.ts` - UI Designer Agent
- `server/agent/agents/refactor.ts` - Refactor Agent
- `server/agent/agents/memory-agent.ts` - Memory Agent (self-learning)
- `server/agent/pipelines/smart-pipeline.ts` - Smart autonomous pipeline
- `server/agent/prompts/roles.ts` - Role-specific prompts
- `server/agent/prompts/manus.ts` - OpenManus-inspired prompts
- `server/agent/tools/implementations/planning.ts` - PlanningTool (CRUD)
- `server/agent/tools/implementations/str-replace-editor.ts` - StrReplaceEditor
- `server/agent/memory/enhanced-memory.ts` - v5.0 Self-learning memory
- `server/agent/memory/scratchpad.ts` - Disk scratchpad
- `client/src/components/ide-workspace.tsx` - Main IDE workspace
- `client/src/components/code-viewer.tsx` - Monaco Editor (split editor support)
- `client/src/components/agent-pipeline.tsx` - Agent pipeline UI (12+ agents)
- `client/src/components/terminal-panel.tsx` - Build timeline
- `client/src/components/command-palette.tsx` - Command palette (Ctrl+Shift+P)
- `client/src/components/snapshot-panel.tsx` - Version snapshots UI
- `client/src/components/approval-dialog.tsx` - Approval gate dialogs
- `client/src/components/monitoring-panel.tsx` - Performance monitoring
- `client/src/components/agent/plan-progress.tsx` - Plan progress UI
- `client/src/components/agent/codeact-viewer.tsx` - CodeAct code viewer
- `client/src/components/agent/sandbox-terminal.tsx` - Sandbox terminal output
- `.env.example` - Full environment variable documentation

## Running
```
npm run dev
```
