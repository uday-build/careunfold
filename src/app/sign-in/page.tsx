import Link from "next/link";
import { Shell } from "@/components/app-shell";
import { Notice } from "@/components/shell";
import { GoogleButton, SignInForm } from "@/components/auth-forms";
import { authErrorMessage } from "@/lib/auth-errors";
import { loadPublicConfig } from "../load";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const query = await searchParams;
  const config = await loadPublicConfig();
  const initialError = authErrorMessage(query.error, "Sign-in did not finish. You can try again.");
  return (
    <Shell>
      <section className="hero stack">
        <h1>Sign in</h1>
        <p className="lede">Use the same Google or email account you registered. If access is still waiting for approval, you will see that next.</p>
        {initialError ? <Notice tone="closed" title="Sign-in did not finish">{initialError}</Notice> : null}
        <section className="option stack" aria-labelledby="google-option">
          <h2 id="google-option">Google</h2>
          <GoogleButton enabled={config.googleSignIn} label="Sign in with Google" returnTo="/sign-in" />
        </section>
        <p className="divider"><span>or</span></p>
        <section className="option stack" aria-labelledby="email-option">
          <h2 id="email-option">Email and password</h2>
          <SignInForm config={config} next={query.next} />
          <p><Link href="/forgot-password">Forgot password</Link></p>
        </section>
        <p>New here? <Link href="/sign-up">Create an account</Link></p>
      </section>
    </Shell>
  );
}
