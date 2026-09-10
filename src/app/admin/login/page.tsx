import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/admin/login/login-form";
import { Logo } from "@/components/logo";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { BRAND, isAdminConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) redirect("/admin");

  return (
    <div className="hero-aurora flex min-h-dvh items-center justify-center bg-ink-950 px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo variant="on-dark" />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Admin console
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Order history and fulfillment tools for {BRAND.name}.
          </p>

          {isAdminConfigured() ? (
            <LoginForm />
          ) : (
            <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              <span className="font-semibold">ADMIN_PASSWORD is not set.</span>{" "}
              The admin console is locked out until you set it in the
              environment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
