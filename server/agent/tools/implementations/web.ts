import { z } from "zod";
import type { ToolResult } from "../registry";

const searchWebSchema = z.object({
  query: z.string().describe("Search query string"),
});

const fetchUrlSchema = z.object({
  url: z.string().url().describe("URL to fetch content from"),
});

export const searchWebDescription = "Search the web using DuckDuckGo HTML (no API key needed) and return results";
export const fetchUrlDescription = "Fetch a URL and extract its text content";

export async function searchWebHandler(args: z.infer<typeof searchWebSchema>): Promise<ToolResult> {
  try {
    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: `q=${encodeURIComponent(args.query)}`,
    });

    if (!response.ok) {
      return { success: false, output: "", error: `Search failed with status ${response.status}` };
    }

    const html = await response.text();
    const results = extractSearchResults(html);

    if (results.length === 0) {
      return { success: true, output: "No results found" };
    }

    const formatted = results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");

    return { success: true, output: formatted };
  } catch (err: any) {
    return { success: false, output: "", error: `Search error: ${err.message}` };
  }
}

export async function fetchUrlHandler(args: z.infer<typeof fetchUrlSchema>): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(args.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, output: "", error: `Fetch failed with status ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml")) {
      return { success: false, output: "", error: `Unsupported content type: ${contentType}` };
    }

    const text = await response.text();
    const extracted = extractTextContent(text);
    const truncated = extracted.length > 5000 ? extracted.slice(0, 5000) + "\n...(truncated)" : extracted;

    return { success: true, output: truncated };
  } catch (err: any) {
    return { success: false, output: "", error: `Fetch error: ${err.message}` };
  }
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function extractSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles: { url: string; title: string }[] = [];
  let match;

  while ((match = resultPattern.exec(html)) !== null) {
    titles.push({
      url: match[1],
      title: stripHtml(match[2]).trim(),
    });
  }

  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null) {
    snippets.push(stripHtml(match[1]).trim());
  }

  for (let i = 0; i < titles.length; i++) {
    let url = titles[i].url;
    if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
      const decoded = decodeURIComponent(url.replace("//duckduckgo.com/l/?uddg=", ""));
      const ampIdx = decoded.indexOf("&");
      url = ampIdx > -1 ? decoded.slice(0, ampIdx) : decoded;
    }
    results.push({
      title: titles[i].title,
      url,
      snippet: snippets[i] || "",
    });
  }

  return results;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");
}

function extractTextContent(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]*>/g, " ");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

export { searchWebSchema, fetchUrlSchema };
