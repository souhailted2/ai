import { ToolResult } from "../tools/registry";

interface LayoutRequirements {
  title?: string;
  sections?: string[];
  colorScheme?: string;
  responsive?: boolean;
}

interface UXSuggestion {
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  border: string;
}

const LAYOUT_TEMPLATES: Record<string, (req: LayoutRequirements) => string> = {
  dashboard: (req) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.title || "Dashboard"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 240px; background: #1e293b; border-right: 1px solid #334155; padding: 20px; flex-shrink: 0; }
    .sidebar h2 { font-size: 1.1rem; margin-bottom: 24px; }
    .nav-item { display: block; padding: 10px 12px; color: #94a3b8; text-decoration: none; border-radius: 8px; margin-bottom: 4px; font-size: 0.9rem; }
    .nav-item:hover, .nav-item.active { background: rgba(59,130,246,0.1); color: #e2e8f0; }
    .main { flex: 1; padding: 24px; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .header h1 { font-size: 1.5rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .stat-label { font-size: 0.8rem; color: #64748b; }
    .stat-value { font-size: 1.6rem; font-weight: 700; margin-top: 4px; }
    .content-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .content-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .content-card h3 { font-size: 1rem; margin-bottom: 12px; }
    @media (max-width: 768px) {
      .layout { flex-direction: column; }
      .sidebar { width: 100%; }
      .content-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h2>${req.title || "Dashboard"}</h2>
      <nav>
        <a href="#" class="nav-item active">Overview</a>
        <a href="#" class="nav-item">Analytics</a>
        <a href="#" class="nav-item">Reports</a>
        <a href="#" class="nav-item">Settings</a>
      </nav>
    </aside>
    <main class="main">
      <div class="header">
        <h1>Overview</h1>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value">2,847</div></div>
        <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value">$48,250</div></div>
        <div class="stat-card"><div class="stat-label">Orders</div><div class="stat-value">1,234</div></div>
        <div class="stat-card"><div class="stat-label">Growth</div><div class="stat-value">+12.5%</div></div>
      </div>
      <div class="content-grid">
        <div class="content-card"><h3>Recent Activity</h3><p>Activity content goes here</p></div>
        <div class="content-card"><h3>Quick Actions</h3><p>Action buttons go here</p></div>
      </div>
    </main>
  </div>
</body>
</html>`,

  landing: (req) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.title || "Landing Page"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    .hero { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); }
    .hero h1 { font-size: 3rem; font-weight: 800; margin-bottom: 16px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 1.2rem; color: #94a3b8; max-width: 600px; margin-bottom: 32px; }
    .btn-primary { background: #3b82f6; color: #fff; border: none; padding: 14px 32px; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .features { padding: 80px 20px; max-width: 1200px; margin: 0 auto; }
    .features h2 { text-align: center; font-size: 2rem; margin-bottom: 48px; }
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
    .feature-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
    .feature-card h3 { font-size: 1.1rem; margin-bottom: 8px; }
    .feature-card p { color: #94a3b8; font-size: 0.9rem; line-height: 1.6; }
    .cta { text-align: center; padding: 80px 20px; background: #1e293b; }
    .cta h2 { font-size: 2rem; margin-bottom: 16px; }
    .cta p { color: #94a3b8; margin-bottom: 32px; }
    footer { text-align: center; padding: 24px; color: #64748b; font-size: 0.85rem; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <section class="hero">
    <h1>${req.title || "Welcome"}</h1>
    <p>A modern landing page template with clean design and responsive layout.</p>
    <button class="btn-primary">Get Started</button>
  </section>
  <section class="features">
    <h2>Features</h2>
    <div class="features-grid">
      <div class="feature-card"><h3>Fast & Reliable</h3><p>Built for performance with modern web technologies.</p></div>
      <div class="feature-card"><h3>Responsive Design</h3><p>Looks great on any device, from mobile to desktop.</p></div>
      <div class="feature-card"><h3>Easy to Customize</h3><p>Simple, clean code that's easy to modify and extend.</p></div>
    </div>
  </section>
  <section class="cta">
    <h2>Ready to Start?</h2>
    <p>Join thousands of users building amazing things.</p>
    <button class="btn-primary">Sign Up Free</button>
  </section>
  <footer>&copy; ${new Date().getFullYear()} ${req.title || "Company"}. All rights reserved.</footer>
</body>
</html>`,

  form: (req) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.title || "Form"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .form-container { width: 100%; max-width: 480px; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; }
    .form-container h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .form-container p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 24px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 6px; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; color: #e2e8f0; font-size: 0.9rem; outline: none; }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: #3b82f6; }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .btn-submit { width: 100%; background: #3b82f6; color: #fff; border: none; padding: 12px; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="form-container">
    <h1>${req.title || "Contact Us"}</h1>
    <p>Fill out the form below and we'll get back to you.</p>
    <form>
      <div class="form-row">
        <div class="form-group"><label>First Name</label><input type="text" placeholder="John"></div>
        <div class="form-group"><label>Last Name</label><input type="text" placeholder="Doe"></div>
      </div>
      <div class="form-group"><label>Email</label><input type="email" placeholder="john@example.com"></div>
      <div class="form-group"><label>Subject</label><select><option>General Inquiry</option><option>Support</option><option>Feedback</option></select></div>
      <div class="form-group"><label>Message</label><textarea placeholder="Your message..."></textarea></div>
      <button type="submit" class="btn-submit">Send Message</button>
    </form>
  </div>
</body>
</html>`,

  "card-grid": (req) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.title || "Card Grid"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 40px; }
    .header h1 { font-size: 2rem; margin-bottom: 8px; }
    .header p { color: #94a3b8; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; transition: transform 0.2s; }
    .card:hover { transform: translateY(-2px); }
    .card-img { height: 180px; background: linear-gradient(135deg, #334155, #1e293b); }
    .card-body { padding: 20px; }
    .card-body h3 { font-size: 1.1rem; margin-bottom: 8px; }
    .card-body p { color: #94a3b8; font-size: 0.85rem; line-height: 1.5; }
    .card-footer { padding: 0 20px 20px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .card-tag { font-size: 0.75rem; background: rgba(59,130,246,0.1); color: #3b82f6; padding: 4px 10px; border-radius: 6px; }
    .card-link { font-size: 0.85rem; color: #3b82f6; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${req.title || "Items"}</h1>
      <p>Browse our collection</p>
    </div>
    <div class="card-grid">
      <div class="card"><div class="card-img"></div><div class="card-body"><h3>Item One</h3><p>A short description of this item.</p></div><div class="card-footer"><span class="card-tag">Category</span><a href="#" class="card-link">View</a></div></div>
      <div class="card"><div class="card-img"></div><div class="card-body"><h3>Item Two</h3><p>A short description of this item.</p></div><div class="card-footer"><span class="card-tag">Category</span><a href="#" class="card-link">View</a></div></div>
      <div class="card"><div class="card-img"></div><div class="card-body"><h3>Item Three</h3><p>A short description of this item.</p></div><div class="card-footer"><span class="card-tag">Category</span><a href="#" class="card-link">View</a></div></div>
      <div class="card"><div class="card-img"></div><div class="card-body"><h3>Item Four</h3><p>A short description of this item.</p></div><div class="card-footer"><span class="card-tag">Category</span><a href="#" class="card-link">View</a></div></div>
      <div class="card"><div class="card-img"></div><div class="card-body"><h3>Item Five</h3><p>A short description of this item.</p></div><div class="card-footer"><span class="card-tag">Category</span><a href="#" class="card-link">View</a></div></div>
      <div class="card"><div class="card-img"></div><div class="card-body"><h3>Item Six</h3><p>A short description of this item.</p></div><div class="card-footer"><span class="card-tag">Category</span><a href="#" class="card-link">View</a></div></div>
    </div>
  </div>
</body>
</html>`,

  sidebar: (req) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.title || "Sidebar Layout"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 260px; background: #1e293b; border-right: 1px solid #334155; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-header { padding: 20px; border-bottom: 1px solid #334155; }
    .sidebar-header h2 { font-size: 1.1rem; }
    .sidebar-nav { flex: 1; padding: 12px; }
    .sidebar-nav a { display: flex; align-items: center; gap: 10px; padding: 10px 12px; color: #94a3b8; text-decoration: none; border-radius: 8px; font-size: 0.9rem; margin-bottom: 2px; }
    .sidebar-nav a:hover, .sidebar-nav a.active { background: rgba(59,130,246,0.1); color: #e2e8f0; }
    .sidebar-footer { padding: 16px 20px; border-top: 1px solid #334155; font-size: 0.8rem; color: #64748b; }
    .main-content { flex: 1; display: flex; flex-direction: column; }
    .topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid #334155; gap: 12px; }
    .topbar h1 { font-size: 1.2rem; }
    .content-area { flex: 1; padding: 24px; overflow-y: auto; }
    @media (max-width: 768px) {
      .sidebar { position: fixed; left: -260px; z-index: 50; height: 100vh; transition: left 0.3s; }
      .sidebar.open { left: 0; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header"><h2>${req.title || "App"}</h2></div>
      <nav class="sidebar-nav">
        <a href="#" class="active">Home</a>
        <a href="#">Projects</a>
        <a href="#">Messages</a>
        <a href="#">Analytics</a>
        <a href="#">Settings</a>
      </nav>
      <div class="sidebar-footer">v1.0.0</div>
    </aside>
    <div class="main-content">
      <div class="topbar"><h1>Home</h1></div>
      <div class="content-area">
        <p>Main content goes here.</p>
      </div>
    </div>
  </div>
</body>
</html>`,
};

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  ocean: { primary: "#3b82f6", secondary: "#06b6d4", accent: "#8b5cf6", background: "#0f172a", text: "#e2e8f0", border: "#334155" },
  forest: { primary: "#22c55e", secondary: "#16a34a", accent: "#84cc16", background: "#0a1a0f", text: "#e2e8f0", border: "#1e3b2a" },
  sunset: { primary: "#f59e0b", secondary: "#ef4444", accent: "#ec4899", background: "#1a0a0a", text: "#e2e8f0", border: "#3b1e1e" },
  midnight: { primary: "#6366f1", secondary: "#8b5cf6", accent: "#a855f7", background: "#0a0a1a", text: "#e2e8f0", border: "#1e1e3b" },
  neutral: { primary: "#64748b", secondary: "#475569", accent: "#94a3b8", background: "#0f172a", text: "#e2e8f0", border: "#334155" },
  coral: { primary: "#f43f5e", secondary: "#fb7185", accent: "#f59e0b", background: "#1a0f0f", text: "#e2e8f0", border: "#3b2020" },
};

const UX_PATTERNS: Array<{ pattern: RegExp; issue: string; suggestion: string; priority: "high" | "medium" | "low" }> = [
  { pattern: /onclick\s*=/gi, issue: "Inline event handlers found", suggestion: "Use addEventListener for better separation of concerns and maintainability", priority: "medium" },
  { pattern: /<table[^>]*>(?!.*role)/gi, issue: "Table without ARIA role", suggestion: "Add role='table' or appropriate ARIA attributes for accessibility", priority: "high" },
  { pattern: /<img[^>]*(?!alt)[^>]*>/gi, issue: "Image without alt attribute", suggestion: "Add descriptive alt text for screen readers and accessibility compliance", priority: "high" },
  { pattern: /<input[^>]*(?!label|aria-label)[^>]*>/gi, issue: "Input may lack associated label", suggestion: "Associate inputs with <label> elements or add aria-label for accessibility", priority: "high" },
  { pattern: /style\s*=\s*"/gi, issue: "Inline styles detected", suggestion: "Move styles to CSS classes for better maintainability and cacheability", priority: "low" },
  { pattern: /font-size:\s*(\d+)px/gi, issue: "Fixed pixel font sizes", suggestion: "Use rem or em units for better scalability and accessibility", priority: "medium" },
  { pattern: /<div[^>]*onclick/gi, issue: "Non-semantic clickable div", suggestion: "Use <button> or <a> for clickable elements to ensure keyboard accessibility", priority: "high" },
  { pattern: /!important/gi, issue: "CSS !important overrides", suggestion: "Reduce specificity conflicts by restructuring CSS selectors instead of using !important", priority: "medium" },
  { pattern: /<br\s*\/?>\s*<br/gi, issue: "Multiple <br> tags for spacing", suggestion: "Use CSS margin or padding for spacing instead of multiple line breaks", priority: "low" },
  { pattern: /position:\s*absolute/gi, issue: "Absolute positioning detected", suggestion: "Consider using flexbox or grid for more maintainable and responsive layouts", priority: "low" },
];

export class UIDesignerAgent {
  generateLayout(type: string, requirements: LayoutRequirements = {}): ToolResult {
    const templateKey = type.toLowerCase().replace(/\s+/g, "-");
    const generator = LAYOUT_TEMPLATES[templateKey];

    if (!generator) {
      const availableTypes = Object.keys(LAYOUT_TEMPLATES).join(", ");
      return {
        success: false,
        output: "",
        error: `Unknown layout type: "${type}". Available types: ${availableTypes}`,
      };
    }

    const html = generator(requirements);

    return {
      success: true,
      output: html,
      artifacts: [`Generated ${type} layout with ${requirements.title || "default"} title`],
    };
  }

  suggestUXImprovements(currentCode: string): ToolResult {
    if (!currentCode || currentCode.trim().length === 0) {
      return { success: false, output: "", error: "No code provided for analysis" };
    }

    const suggestions: UXSuggestion[] = [];

    for (const rule of UX_PATTERNS) {
      const matches = currentCode.match(rule.pattern);
      if (matches && matches.length > 0) {
        suggestions.push({
          issue: `${rule.issue} (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`,
          suggestion: rule.suggestion,
          priority: rule.priority,
        });
      }
    }

    if (!/<meta[^>]*viewport/i.test(currentCode) && /<html/i.test(currentCode)) {
      suggestions.push({
        issue: "Missing viewport meta tag",
        suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0"> for mobile responsiveness',
        priority: "high",
      });
    }

    if (!/<meta[^>]*charset/i.test(currentCode) && /<html/i.test(currentCode)) {
      suggestions.push({
        issue: "Missing charset meta tag",
        suggestion: 'Add <meta charset="UTF-8"> for proper text encoding',
        priority: "medium",
      });
    }

    if (/@media/i.test(currentCode)) {
      suggestions.push({
        issue: "Media queries detected",
        suggestion: "Good: Responsive design is in use. Consider mobile-first approach.",
        priority: "low",
      });
    }

    if (!/<nav/i.test(currentCode) && /<a[^>]*href/i.test(currentCode)) {
      suggestions.push({
        issue: "Links without semantic navigation container",
        suggestion: "Wrap navigation links in a <nav> element for better accessibility",
        priority: "medium",
      });
    }

    suggestions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    const report = suggestions.length > 0
      ? suggestions.map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.issue}\n   Suggestion: ${s.suggestion}`).join("\n\n")
      : "No significant UX issues detected. The code follows good practices.";

    return {
      success: true,
      output: `UX Analysis Report\n${"=".repeat(40)}\nFound ${suggestions.length} suggestion(s):\n\n${report}`,
    };
  }

  generateColorScheme(theme: string): ToolResult {
    const themeKey = theme.toLowerCase().trim();
    const scheme = COLOR_SCHEMES[themeKey];

    if (!scheme) {
      const closestMatch = Object.keys(COLOR_SCHEMES).find((k) => themeKey.includes(k) || k.includes(themeKey));
      if (closestMatch) {
        const matched = COLOR_SCHEMES[closestMatch];
        return {
          success: true,
          output: this.formatColorScheme(closestMatch, matched),
        };
      }

      const availableThemes = Object.keys(COLOR_SCHEMES).join(", ");
      return {
        success: true,
        output: `Theme "${theme}" not found. Available themes: ${availableThemes}\n\nUsing default "ocean" theme:\n${this.formatColorScheme("ocean", COLOR_SCHEMES.ocean)}`,
      };
    }

    return {
      success: true,
      output: this.formatColorScheme(themeKey, scheme),
    };
  }

  getAvailableLayouts(): string[] {
    return Object.keys(LAYOUT_TEMPLATES);
  }

  getAvailableColorSchemes(): string[] {
    return Object.keys(COLOR_SCHEMES);
  }

  private formatColorScheme(name: string, scheme: ColorScheme): string {
    return `Color Scheme: ${name}\n${"=".repeat(30)}
:root {
  --color-primary: ${scheme.primary};
  --color-secondary: ${scheme.secondary};
  --color-accent: ${scheme.accent};
  --color-background: ${scheme.background};
  --color-text: ${scheme.text};
  --color-border: ${scheme.border};
}

CSS Classes:
  .text-primary { color: ${scheme.primary}; }
  .text-secondary { color: ${scheme.secondary}; }
  .bg-primary { background-color: ${scheme.primary}; }
  .bg-secondary { background-color: ${scheme.secondary}; }
  .bg-accent { background-color: ${scheme.accent}; }
  .border-default { border-color: ${scheme.border}; }`;
  }
}

export const uiDesignerAgent = new UIDesignerAgent();
