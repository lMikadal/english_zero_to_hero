// Liveness only: used by the docker healthchecks, so it must never touch the database or seed the learner.
export function GET() {
  return Response.json({ ok: true });
}
