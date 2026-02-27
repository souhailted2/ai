import { ToolResult } from "../tools/registry";

interface CodeSmell {
  type: string;
  description: string;
  line?: number;
  severity: "error" | "warning" | "info";
  suggestion: string;
}

interface RefactoringSuggestion {
  pattern: string;
  description: string;
  before: string;
  after: string;
  impact: "high" | "medium" | "low";
}

interface ModernizationRule {
  name: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  description: string;
}

const CODE_SMELL_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  description: string;
  severity: "error" | "warning" | "info";
  suggestion: string;
}> = [
  { pattern: /\bvar\s+/g, type: "var-usage", description: "Usage of 'var' instead of 'let' or 'const'", severity: "warning", suggestion: "Replace 'var' with 'const' (for immutable) or 'let' (for mutable variables)" },
  { pattern: /function\s+\w+\s*\([^)]*\)\s*\{[^}]{500,}\}/g, type: "long-function", description: "Function body exceeds 500 characters — may be too complex", severity: "warning", suggestion: "Break into smaller, focused functions with single responsibility" },
  { pattern: /\.then\s*\(\s*(?:function|\([^)]*\)\s*=>)/g, type: "callback-chain", description: "Promise .then() chain detected", severity: "info", suggestion: "Consider using async/await for cleaner asynchronous code" },
  { pattern: /console\.(log|warn|error|debug|info)\s*\(/g, type: "console-statement", description: "Console statements found (potential debug leftovers)", severity: "info", suggestion: "Remove debug console statements or replace with proper logging framework" },
  { pattern: /\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*HACK|\/\/\s*XXX/gi, type: "todo-comment", description: "TODO/FIXME/HACK comment found — technical debt marker", severity: "info", suggestion: "Address the TODO item or create a tracked issue for it" },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, type: "empty-catch", description: "Empty catch block — silently swallowing errors", severity: "error", suggestion: "Add proper error handling, logging, or re-throw the error" },
  { pattern: /if\s*\([^)]+\)\s*\{[^}]*if\s*\([^)]+\)\s*\{[^}]*if\s*\([^)]+\)/g, type: "deep-nesting", description: "Deeply nested conditionals (3+ levels)", severity: "warning", suggestion: "Use early returns, guard clauses, or extract nested logic into separate functions" },
  { pattern: /(\b\w+\b)(?:\s*,\s*\b\w+\b){6,}/g, type: "too-many-params", description: "Function or destructuring with many parameters", severity: "warning", suggestion: "Consider using an options/config object pattern for functions with many parameters" },
  { pattern: /==(?!=)/g, type: "loose-equality", description: "Loose equality (==) used instead of strict equality (===)", severity: "warning", suggestion: "Use strict equality (===) to avoid type coercion bugs" },
  { pattern: /new\s+Date\(\)\s*\.getTime\(\)/g, type: "date-pattern", description: "Verbose date timestamp pattern", severity: "info", suggestion: "Use Date.now() for cleaner timestamp retrieval" },
  { pattern: /document\.getElementById|document\.querySelector|document\.getElementsBy/g, type: "dom-query", description: "Direct DOM manipulation detected", severity: "info", suggestion: "Consider using a framework or component-based approach for DOM management" },
  { pattern: /eval\s*\(/g, type: "eval-usage", description: "Usage of eval() — security risk", severity: "error", suggestion: "Remove eval() usage. Use JSON.parse(), Function constructor, or restructure the logic" },
  { pattern: /\bany\b/g, type: "typescript-any", description: "TypeScript 'any' type detected", severity: "warning", suggestion: "Replace 'any' with specific types for better type safety" },
  { pattern: /(\w+)\s*=\s*\1\s*\|\|\s*/g, type: "self-or-assignment", description: "Self-OR assignment pattern", severity: "info", suggestion: "Use nullish coalescing (??=) or logical OR assignment (||=)" },
];

const MODERNIZATION_RULES: ModernizationRule[] = [
  {
    name: "var-to-const-let",
    pattern: /\bvar\s+(\w+)\s*=/g,
    replacement: "const $1 =",
    description: "Replace var with const (review for let if reassigned)",
  },
  {
    name: "template-literals",
    pattern: /(['"])([^'"]*)\1\s*\+\s*(\w+)\s*\+\s*(['"])([^'"]*)\4/g,
    replacement: "`$2${$3}$5`",
    description: "Convert string concatenation to template literals",
  },
  {
    name: "arrow-functions",
    pattern: /function\s*\(([^)]*)\)\s*\{(\s*return\s+[^;]+;\s*)\}/g,
    replacement: "($1) => {$2}",
    description: "Convert anonymous functions to arrow functions",
  },
  {
    name: "object-shorthand",
    pattern: /(\w+)\s*:\s*\1(?=[,\s}])/g,
    replacement: "$1",
    description: "Use object property shorthand",
  },
  {
    name: "optional-chaining",
    pattern: /(\w+)\s*&&\s*\1\.(\w+)/g,
    replacement: "$1?.$2",
    description: "Use optional chaining (?.) for safe property access",
  },
  {
    name: "nullish-coalescing",
    pattern: /(\w+)\s*!==?\s*(?:null|undefined)\s*\?\s*\1\s*:\s*/g,
    replacement: "$1 ?? ",
    description: "Use nullish coalescing (??) operator",
  },
];

const COMPLEXITY_KEYWORDS: Record<string, number> = {
  "if": 1,
  "else": 1,
  "for": 2,
  "while": 2,
  "switch": 1,
  "case": 1,
  "catch": 1,
  "&&": 1,
  "||": 1,
  "?": 1,
};

export class RefactorAgent {
  analyzeCode(code: string): ToolResult {
    if (!code || code.trim().length === 0) {
      return { success: false, output: "", error: "No code provided for analysis" };
    }

    const smells: CodeSmell[] = [];
    const lines = code.split("\n");

    for (const rule of CODE_SMELL_PATTERNS) {
      const matches = code.match(rule.pattern);
      if (matches && matches.length > 0) {
        let lineNum: number | undefined;
        const firstMatchIndex = code.search(rule.pattern);
        if (firstMatchIndex >= 0) {
          lineNum = code.substring(0, firstMatchIndex).split("\n").length;
        }

        smells.push({
          type: rule.type,
          description: `${rule.description} (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`,
          line: lineNum,
          severity: rule.severity,
          suggestion: rule.suggestion,
        });
      }
    }

    const duplicates = this.findDuplicateBlocks(lines);
    if (duplicates.length > 0) {
      smells.push({
        type: "code-duplication",
        description: `Found ${duplicates.length} potentially duplicated code block(s)`,
        severity: "warning",
        suggestion: "Extract duplicated code into reusable functions or modules",
      });
    }

    const complexity = this.calculateComplexity(code);
    if (complexity > 15) {
      smells.push({
        type: "high-complexity",
        description: `Cyclomatic complexity score: ${complexity} (threshold: 15)`,
        severity: "warning",
        suggestion: "Reduce complexity by extracting logic, using early returns, and simplifying conditionals",
      });
    }

    if (lines.length > 300) {
      smells.push({
        type: "large-file",
        description: `File has ${lines.length} lines — consider splitting`,
        severity: "info",
        suggestion: "Split into multiple smaller modules with clear responsibilities",
      });
    }

    smells.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    const report = smells.length > 0
      ? smells.map((s, i) =>
        `${i + 1}. [${s.severity.toUpperCase()}] ${s.type}${s.line ? ` (line ~${s.line})` : ""}\n   ${s.description}\n   Fix: ${s.suggestion}`
      ).join("\n\n")
      : "No significant code smells detected. The code looks clean.";

    const summary = {
      totalIssues: smells.length,
      errors: smells.filter((s) => s.severity === "error").length,
      warnings: smells.filter((s) => s.severity === "warning").length,
      info: smells.filter((s) => s.severity === "info").length,
      complexity,
      lines: lines.length,
    };

    return {
      success: true,
      output: `Code Analysis Report\n${"=".repeat(40)}\nLines: ${summary.lines} | Complexity: ${summary.complexity} | Issues: ${summary.totalIssues} (${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info)\n\n${report}`,
    };
  }

  suggestRefactoring(code: string): ToolResult {
    if (!code || code.trim().length === 0) {
      return { success: false, output: "", error: "No code provided for refactoring suggestions" };
    }

    const suggestions: RefactoringSuggestion[] = [];

    for (const rule of MODERNIZATION_RULES) {
      const matches = code.match(rule.pattern);
      if (matches && matches.length > 0) {
        const example = matches[0];
        const modernized = example.replace(rule.pattern, rule.replacement as string);

        suggestions.push({
          pattern: rule.name,
          description: rule.description,
          before: example.trim(),
          after: modernized.trim(),
          impact: rule.name === "var-to-const-let" ? "high" : "medium",
        });
      }
    }

    const longFunctions = code.match(/function\s+(\w+)\s*\([^)]*\)\s*\{/g);
    if (longFunctions && longFunctions.length > 8) {
      suggestions.push({
        pattern: "module-extraction",
        description: `${longFunctions.length} functions in one file — consider splitting into modules`,
        before: "All functions in a single file",
        after: "Functions organized by responsibility into separate modules",
        impact: "high",
      });
    }

    if (/require\s*\(/g.test(code) && /import\s+/g.test(code)) {
      suggestions.push({
        pattern: "consistent-imports",
        description: "Mixed require() and import statements",
        before: 'const x = require("module")',
        after: 'import x from "module"',
        impact: "medium",
      });
    }

    suggestions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.impact] - order[b.impact];
    });

    const report = suggestions.length > 0
      ? suggestions.map((s, i) =>
        `${i + 1}. [${s.impact.toUpperCase()}] ${s.description}\n   Before: ${s.before}\n   After:  ${s.after}`
      ).join("\n\n")
      : "No refactoring suggestions. The code follows modern patterns.";

    return {
      success: true,
      output: `Refactoring Suggestions\n${"=".repeat(40)}\nFound ${suggestions.length} suggestion(s):\n\n${report}`,
    };
  }

  modernize(code: string, targetStack?: string): ToolResult {
    if (!code || code.trim().length === 0) {
      return { success: false, output: "", error: "No code provided for modernization" };
    }

    let modernized = code;
    const appliedRules: string[] = [];

    for (const rule of MODERNIZATION_RULES) {
      if (rule.pattern.test(modernized)) {
        rule.pattern.lastIndex = 0;
        modernized = modernized.replace(rule.pattern, rule.replacement as string);
        appliedRules.push(rule.description);
      }
    }

    modernized = modernized.replace(
      /new\s+Date\(\)\s*\.getTime\(\)/g,
      "Date.now()"
    );
    if (/Date\.now\(\)/.test(modernized) && !/Date\.now\(\)/.test(code)) {
      appliedRules.push("Simplified Date().getTime() to Date.now()");
    }

    modernized = modernized.replace(
      /Object\.keys\((\w+)\)\.forEach\(function\s*\((\w+)\)\s*\{/g,
      "for (const $2 of Object.keys($1)) {"
    );
    if (/for \(const \w+ of Object\.keys/.test(modernized) && !/for \(const \w+ of Object\.keys/.test(code)) {
      appliedRules.push("Converted Object.keys().forEach to for...of loop");
    }

    if (targetStack) {
      appliedRules.push(`Target stack "${targetStack}" noted for context`);
    }

    if (appliedRules.length === 0) {
      return {
        success: true,
        output: "No modernization changes needed. The code already uses modern patterns.\n\nOriginal code returned unchanged.",
      };
    }

    return {
      success: true,
      output: `Modernization Applied\n${"=".repeat(40)}\nApplied ${appliedRules.length} modernization(s):\n${appliedRules.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}\n\n--- Modernized Code ---\n${modernized}`,
    };
  }

  private findDuplicateBlocks(lines: string[]): string[] {
    const duplicates: string[] = [];
    const blockSize = 4;

    if (lines.length < blockSize * 2) return duplicates;

    const blocks = new Map<string, number>();
    for (let i = 0; i <= lines.length - blockSize; i++) {
      const block = lines
        .slice(i, i + blockSize)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join("\n");

      if (block.length > 20) {
        const count = blocks.get(block) || 0;
        blocks.set(block, count + 1);
      }
    }

    blocks.forEach((count, block) => {
      if (count > 1) {
        duplicates.push(block);
      }
    });

    return duplicates;
  }

  private calculateComplexity(code: string): number {
    let complexity = 1;

    for (const [keyword, weight] of Object.entries(COMPLEXITY_KEYWORDS)) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "g");
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length * weight;
      }
    }

    return complexity;
  }
}

export const refactorAgent = new RefactorAgent();
