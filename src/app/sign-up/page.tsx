import Link from "next/link";
import { Shell } from "@/components/shell";
import { SignUpForm } from "@/components/auth-forms";
import { loadPublicConfig } from "../load";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const config = await loadPublicConfig();
  return (
    <Shell>
      <section className="hero stack">
        <h1>Create your account</h1>
        <p className="lede">You will verify your email before a session is created. A duplicate address gets the same confirmation, without revealing whether an account already exists.</p>
        <SignUpForm config={config} />
        <p>Already registered? <Link href="/sign-in">Sign in</Link></p>
      </section>
    </Shell>
  );
}
