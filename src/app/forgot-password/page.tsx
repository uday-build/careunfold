import Link from "next/link";
import { Shell } from "@/components/shell";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { loadPublicConfig } from "../load";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const config = await loadPublicConfig();
  return (
    <Shell>
      <section className="hero stack">
        <h1>Reset your password</h1>
        <p className="lede">The response is the same whether or not an account exists for that address.</p>
        <ForgotPasswordForm config={config} />
        <p><Link href="/sign-in">Return to sign in</Link></p>
      </section>
    </Shell>
  );
}
