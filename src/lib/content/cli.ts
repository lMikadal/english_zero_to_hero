import path from "node:path";
import { formatProblem, formatSummary, validateContentDir } from "./validate";

/** Content root from the CLI args (`pnpm content:validate [dir]`); defaults to ./content. */
export function contentRootFromArgs(args: string[], cwd: string): string {
  return path.resolve(cwd, args[0] ?? "content");
}

/** Validates `root`, prints a summary and one line per problem. Returns the process exit code. */
export function runValidate(root: string, log: (line: string) => void): number {
  const { problems, summary } = validateContentDir(root);
  log(formatSummary(summary));
  if (problems.length === 0) {
    log("content: OK");
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
