// Thin CLI wrapper: `pnpm content:validate` (inside the container). Logic lives in src/lib/content/.
import path from "node:path";
import { runValidate } from "../src/lib/content/cli";

process.exitCode = runValidate(path.resolve(process.cwd(), "content"), (l) => console.log(l));
