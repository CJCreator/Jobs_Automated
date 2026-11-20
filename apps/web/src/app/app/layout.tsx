import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth, signOut } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <>
      <AppHeader email={session.user.email}>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" size="sm">
            {en.app.signOut}
          </Button>
        </form>
      </AppHeader>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
