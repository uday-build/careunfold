import { headers } from "next/headers";
import { PreferencesForm } from "@/components/app-actions";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { getSettings } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const { actor } = await loadApp();
  const incoming = await headers();
  const settings = await getSettings(
    getContext(),
    actor,
    new Request("http://localhost/app/account", { headers: { cookie: incoming.get("cookie") ?? "" } }),
  );
  return (
    <section className="stack">
      <p className="eyebrow">Account</p>
      <h1>Profile</h1>
      <p className="lede">The name and preferences for this signed-in account.</p>
      <section className="card stack">
        <h2>Account holder</h2>
        <p><strong>{actor.name || "Name not set"}</strong></p>
        <p className="muted">{actor.email}</p>
      </section>
      <section className="card stack">
        <h2>Preferences</h2>
        <PreferencesForm preferences={settings.preferences} />
      </section>
    </section>
  );
}
