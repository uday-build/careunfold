import Link from "next/link";
import { Shell } from "@/components/shell";
import { currentActor } from "@/server/auth/current";
import { loadPublicConfig } from "./load";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ actor }, config] = await Promise.all([currentActor(), loadPublicConfig()]);
  return (
    <Shell>
      <section className="hero grid">
        <div>
          <p className="muted">CareUnfold</p>
          <h1>Keep the people you care for in one place.</h1>
          <p className="lede">Create an account, set up your household, and decide who can see each person’s information. Bills and explanations of benefits are not part of this version.</p>
          <div className="actions">
            {actor ? <Link className="button" href="/auth/continue">Continue</Link> : <Link className="button" href="/sign-up">Create account</Link>}
            <Link className="secondary" href="/sign-in">Sign in</Link>
          </div>
        </div>
        <div className="card stack">
          <h2>This version</h2>
          <p>Email and password sign-in{config.googleSignIn ? ", plus Google when you choose it." : ". Google sign-in is not configured on this server."}</p>
          <p>Family setup, invitations, and coverage you type in yourself.</p>
          <p className="muted">Nothing here uploads a medical document or contacts a provider.</p>
        </div>
      </section>
    </Shell>
  );
}
