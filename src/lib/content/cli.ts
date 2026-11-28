import fs from "node:fs";
import path from "node:path";
import { formatProblem, formatSummary, validateContentDir } from "./validate";

/** Content root from the CLI args (`pnpm content:validate [dir]`); defaults to ./content. */
export function contentRootFromArgs(args: string[], cwd: string): string {
  return path.resolve(cwd, args[0] ?? "content");
}

/** Validates `root`, prints a summary and one line per problem, and appends the same text to `summaryFile` (GITHUB_STEP_SUMMARY) when given. Returns the process exit code. */
export function runValidate(root: string, log: (line: string) => void, summaryFile?: string): number {
  const lines: string[] = [];
  const out = (l: string) => { lines.push(l); log(l); };
  const code = validateAndPrint(root, out);
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, `### Content validator\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
    } catch { /* the summary is a convenience; never fail the check over it */ }
  }
  return code;
}

function validateAndPrint(root: string, log: (line: string) => void): number {
  const { problems: all, summary } = validateContentDir(root);
  const problems = all.filter((p) => p.severity !== "warning");
  const warnings = all.filter((p) => p.severity === "warning");
  log(formatSummary(summary));
  if (warnings.length) {
    log(`\n== warnings (${warnings.length}, do not fail the check) ==`);
    for (const w of warnings) log(`WARN ${formatProblem(w)}`);
  }
  if (problems.length === 0) {
    log(warnings.length ? `content: OK (${warnings.length} warning(s))` : "content: OK");
    return 0;
  }
  // structural problems first as before, then the content rules, grouped by rule
  for (const p of problems.filter((p) => !p.rule)) log(`ERROR ${formatProblem(p)}`);
  const rules = [...new Set(problems.flatMap((p) => (p.rule ? [p.rule] : [])))];
  for (const rule of rules) {
    const group = problems.filter((p) => p.rule === rule);
    log(`\n== rule ${rule} (${group.length}); see docs/CONTENT_SCHEMA.md, section "กฎที่ตัวตรวจบังคับ" ==`);
    for (const p of group) log(`ERROR ${formatProblem(p)}`);
  }
  log(`content: ${problems.length} problem(s) found`);
  return 1;
}
