import Link from "next/link";
import { Shell } from "@/components/shell";
import { SignInForm } from "@/components/auth-forms";
import { loadPublicConfig } from "../load";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  access_denied: "Google sign-in was canceled. No session was created and no account was linked.",
  INVALID_TOKEN: "That link cannot be used. Request a new one.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const query = await searchParams;
  const config = await loadPublicConfig();
  const initialError = query.error ? errors[query.error] ?? "Sign-in did not finish. You can try again." : undefined;
  return (
    <Shell>
      <section className="hero stack">
        <h1>Sign in</h1>
        <SignInForm config={config} next={query.next} initialError={initialError} />
        <p><Link href="/forgot-password">Forgot password</Link></p>
        <p>New here? <Link href="/sign-up">Create an account</Link></p>
      </section>
    </Shell>
  );
}
