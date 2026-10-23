import { headers } from "next/headers";
import { GoogleLinkCard } from "@/components/app-actions";
import { Notice } from "@/components/shell";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getSettings } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function AccountContactPage() {
  const { actor } = await loadApp();
  const incoming = await headers();
  const settings = await getSettings(
    getContext(),
    actor,
    new Request("http://localhost/app/account/contact", { headers: { cookie: incoming.get("cookie") ?? "" } }),
  );
  return (
    <section className="stack">
      <p className="eyebrow">Account</p>
      <h1>Contact</h1>
      <p className="lede">How CareUnfold can reach this account. Additional numbers are not stored yet.</p>
      <section className="card stack">
        <h2>Email</h2>
        <p>{actor.email}</p>
        <p className="muted">{actor.emailVerified ? "Verified." : "Not verified."}</p>
      </section>
      <Notice tone="info" title="No other contact details">Phone numbers and mailing addresses are not part of this version.</Notice>
      <GoogleLinkCard providers={settings.providers} googleLinkAvailable={settings.googleLinkAvailable} />
    </section>
  );
}
