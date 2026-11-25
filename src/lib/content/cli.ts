import { formatProblem, formatSummary, validateContentDir } from "./validate";

/** Validates `root`, prints a summary and one line per problem. Returns the process exit code. */
export function runValidate(root: string, log: (line: string) => void): number {
  const { problems, summary } = validateContentDir(root);
  log(formatSummary(summary));
  if (problems.length === 0) {
    log("content: OK");
    return 0;
  }
  for (const p of problems) log(`ERROR ${formatProblem(p)}`);
  log(`content: ${problems.length} problem(s) found`);
  return 1;
}
