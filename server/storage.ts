import {
  type Project, type InsertProject,
  type ProjectFile, type InsertProjectFile,
  type ChatMessage, type InsertChatMessage,
  type AgentActivity, type InsertAgentActivity,
  type Memory,
  projects, projectFiles, chatMessages, agentActivities, memories,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;

  getProjectFiles(projectId: string): Promise<ProjectFile[]>;
  getProjectFile(id: string): Promise<ProjectFile | undefined>;
  createProjectFile(file: InsertProjectFile): Promise<ProjectFile>;
  updateProjectFile(id: string, content: string): Promise<ProjectFile | undefined>;
  renameProjectFile(id: string, newPath: string): Promise<ProjectFile | undefined>;
  deleteProjectFile(id: string): Promise<void>;

  getChatMessages(projectId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  getAgentActivities(projectId: string): Promise<AgentActivity[]>;
  createAgentActivity(activity: InsertAgentActivity): Promise<AgentActivity>;
  updateAgentActivity(id: string, status: string, message?: string): Promise<AgentActivity | undefined>;

  getMemory(key: string): Promise<Memory | undefined>;
  setMemory(key: string, value: string, category?: string): Promise<Memory>;
  getAllMemories(): Promise<Memory[]>;
  getMemoriesByCategory(category: string): Promise<Memory[]>;
  deleteMemory(key: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(agentActivities).where(eq(agentActivities.projectId, id));
    await db.delete(chatMessages).where(eq(chatMessages.projectId, id));
    await db.delete(projectFiles).where(eq(projectFiles.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId));
  }

  async getProjectFile(id: string): Promise<ProjectFile | undefined> {
    const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, id));
    return file;
  }

  async createProjectFile(file: InsertProjectFile): Promise<ProjectFile> {
    const [created] = await db.insert(projectFiles).values(file).returning();
    return created;
  }

  async updateProjectFile(id: string, content: string): Promise<ProjectFile | undefined> {
    const [updated] = await db.update(projectFiles).set({ content }).where(eq(projectFiles.id, id)).returning();
    return updated;
  }

  async renameProjectFile(id: string, newPath: string): Promise<ProjectFile | undefined> {
    const lang = this.detectLanguage(newPath);
    const [updated] = await db.update(projectFiles).set({ path: newPath, language: lang }).where(eq(projectFiles.id, id)).returning();
    return updated;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const langMap: Record<string, string> = {
      js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
      json: "json", html: "html", css: "css", md: "markdown", txt: "text",
      py: "python", java: "java", c: "c", cpp: "cpp", xml: "xml", yaml: "yaml", yml: "yaml",
    };
    return langMap[ext] || "text";
  }

  async deleteProjectFile(id: string): Promise<void> {
    await db.delete(projectFiles).where(eq(projectFiles.id, id));
  }

  async getChatMessages(projectId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.projectId, projectId)).orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }

  async getAgentActivities(projectId: string): Promise<AgentActivity[]> {
    return db.select().from(agentActivities).where(eq(agentActivities.projectId, projectId)).orderBy(desc(agentActivities.createdAt));
  }

  async createAgentActivity(activity: InsertAgentActivity): Promise<AgentActivity> {
    const [created] = await db.insert(agentActivities).values(activity).returning();
    return created;
  }

  async updateAgentActivity(id: string, status: string, message?: string): Promise<AgentActivity | undefined> {
    const updateData: any = { status };
    if (message) updateData.message = message;
    const [updated] = await db.update(agentActivities).set(updateData).where(eq(agentActivities.id, id)).returning();
    return updated;
  }

  async getMemory(key: string): Promise<Memory | undefined> {
    const [mem] = await db.select().from(memories).where(eq(memories.key, key));
    return mem;
  }

  async setMemory(key: string, value: string, category: string = "general"): Promise<Memory> {
    const existing = await this.getMemory(key);
    if (existing) {
      const [updated] = await db.update(memories)
        .set({ value, category, updatedAt: new Date() })
        .where(eq(memories.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(memories).values({ key, value, category }).returning();
    return created;
  }

  async getAllMemories(): Promise<Memory[]> {
    return db.select().from(memories).orderBy(desc(memories.updatedAt));
  }

  async getMemoriesByCategory(category: string): Promise<Memory[]> {
    return db.select().from(memories).where(eq(memories.category, category));
  }

  async deleteMemory(key: string): Promise<void> {
    await db.delete(memories).where(eq(memories.key, key));
  }
}

export const storage = new DatabaseStorage();
