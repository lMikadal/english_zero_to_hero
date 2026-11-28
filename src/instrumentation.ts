// Runs once when the Next.js server starts (Node.js runtime only).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateAccessEnv } = await import("./lib/access/guard");
  for (const w of validateAccessEnv(process.env)) console.warn(`[access] WARNING ${w}`);
  // a malformed ALLOWED_IPS must stop the server, never silently change who may connect
  const { installPeerStamp } = await import("./lib/access/peer-stamp");
  installPeerStamp();
}
