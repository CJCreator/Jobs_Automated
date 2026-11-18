import { signOut } from "@/auth";
import { getDb } from "@/lib/db/index.mjs";
import { deleteUserData } from "@/lib/db/repo.mjs";
import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

export const DELETE = route("account.delete", async (_req, { state }) => {
  const userId = await requireUser(state);
  // Deleting the user row cascades to every table that holds their data.
  await deleteUserData(await getDb(), userId);
  try {
    await signOut({ redirect: false });
  } catch {
    // Clearing the cookie is a courtesy: with the row gone, requireUser already refuses it.
  }
  return json({ ok: true });
});
