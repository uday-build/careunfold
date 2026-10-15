import { Shell } from "@/components/app-shell";
import { Notice } from "@/components/shell";
import { ResetPasswordForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <Shell>
      <section className="hero stack">
        <h1>Choose a new password</h1>
        {query.error ? <Notice tone="closed" title="This reset link cannot be used">Request a new one. The previous link did not change your password.</Notice> : null}
        <ResetPasswordForm token={query.token} error={query.error ? "This reset link cannot be used." : undefined} />
      </section>
    </Shell>
  );
}
