import Link from "next/link";
import { Shell, Notice } from "@/components/shell";
import { ResendVerificationForm } from "@/components/auth-forms";
import { currentActor } from "@/server/auth/current";
import { loadPublicConfig } from "../load";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const [{ actor }, config] = await Promise.all([currentActor(), loadPublicConfig()]);
  return (
    <Shell>
      <section className="hero stack">
        <h1>Verify your email</h1>
        {query.error ? (
          <Notice tone="closed" title="This verification link cannot be used">It may be expired or already used. Request another message. No session was created from this link.</Notice>
        ) : null}
        {actor?.emailVerified ? (
          <Notice tone="active" title="Your email is verified">
            <Link href="/auth/continue">Continue to your account</Link>
          </Notice>
        ) : (
          <>
            <p className="lede">Open the verification message for this address. Until that link is used, sign-in stays closed.</p>
            <ResendVerificationForm config={config} />
          </>
        )}
      </section>
    </Shell>
  );
}
