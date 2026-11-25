// Thin CLI wrapper: `pnpm content:validate [dir]` (inside the container). Logic lives in src/lib/content/.
import { contentRootFromArgs, runValidate } from "../src/lib/content/cli";

process.exitCode = runValidate(contentRootFromArgs(process.argv.slice(2), process.cwd()), (l) => console.log(l));
