import { withAuth } from "@/lib/auth/protect";
import { resetDB } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Reset the synthetic demo state. No real data exists in this prototype. */
export const POST = withAuth(async () => {
  resetDB();
  return Response.json({ ok: true });
});
