import Link from "next/link";
import { Shell } from "@/components/app-shell";
import { Notice } from "@/components/shell";
import { GoogleButton, SignUpForm } from "@/components/auth-forms";
import { authErrorMessage } from "@/lib/auth-errors";
import { loadPublicConfig } from "../load";

export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const config = await loadPublicConfig();
  const error = authErrorMessage(query.error, "Google sign-up did not finish. No account was created.");
  return (
    <Shell>
      <section className="hero stack">
        <h1>Create your account</h1>
        <p className="lede">Choose Google or email. Registration is stored. The workspace stays closed until an administrator approves access.</p>
        {error ? <Notice tone="closed" title="Google sign-up did not finish">{error}</Notice> : null}
        <section className="option stack" aria-labelledby="google-option">
          <h2 id="google-option">Use your Google account</h2>
          <p className="muted">Google confirms your email, so there is no verification message to open.</p>
          <GoogleButton enabled={config.googleSignIn} label="Sign up with Google" returnTo="/sign-up" />
        </section>
        <p className="divider"><span>or</span></p>
        <section className="option stack" aria-labelledby="email-option">
          <h2 id="email-option">Use email and password</h2>
          <p className="muted">You will open a verification link before your first sign-in. A duplicate address gets the same confirmation, without revealing whether an account already exists.</p>
          <SignUpForm config={config} />
        </section>
        <p>Already registered? <Link href="/sign-in">Sign in</Link></p>
      </section>
    </Shell>
  );
}
