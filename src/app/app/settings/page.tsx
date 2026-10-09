import { headers } from "next/headers";
import { SettingsPanel } from "@/components/app-actions";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { getSettings } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { actor } = await loadApp();
  const incoming = await headers();
  const settings = await getSettings(
    getContext(),
    actor,
    new Request("http://localhost/app/settings", { headers: { cookie: incoming.get("cookie") ?? "" } }),
  );
  return (
    <section className="stack">
      <h1>Settings</h1>
      <p className="lede">{actor.email}</p>
      <SettingsPanel
        sessions={settings.sessions.map((session) => ({
          id: session.id,
          userAgent: session.userAgent ?? null,
          current: session.current,
          createdAt: new Date(session.createdAt).toISOString(),
        }))}
        preferences={settings.preferences}
        googleLinkAvailable={settings.googleLinkAvailable}
        providers={settings.providers}
        privacyRequests={settings.privacyRequests.map((item) => ({
          id: item.id,
          kind: item.kind,
          status: item.status,
          detail: item.detail,
        }))}
      />
    </section>
  );
}
