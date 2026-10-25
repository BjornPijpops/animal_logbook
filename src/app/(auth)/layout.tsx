import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/features/auth";
import { Card } from "@/components/ui/card";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getSessionUser()) redirect("/");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-4 py-8">
      <Card className="w-full p-6">{children}</Card>
    </main>
  );
}
