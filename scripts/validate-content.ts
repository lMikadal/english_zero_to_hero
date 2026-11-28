// Also appends the report to $CONTENT_VALIDATE_SUMMARY or $GITHUB_STEP_SUMMARY when set (see Makefile `validate` and ci.yml).
// Thin CLI wrapper: `pnpm content:validate [dir]` (inside the container). Logic lives in src/lib/content/.
import { contentRootFromArgs, runValidate } from "../src/lib/content/cli";

process.exitCode = runValidate(contentRootFromArgs(process.argv.slice(2), process.cwd()), (l) => console.log(l), process.env.CONTENT_VALIDATE_SUMMARY || process.env.GITHUB_STEP_SUMMARY || undefined);
