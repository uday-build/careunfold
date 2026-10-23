import { headers } from "next/headers";
import { PasswordForm, PrivacyCard, SessionList } from "@/components/app-actions";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getSettings } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const { actor } = await loadApp();
  const incoming = await headers();
  const settings = await getSettings(
    getContext(),
    actor,
    new Request("http://localhost/app/account/security", { headers: { cookie: incoming.get("cookie") ?? "" } }),
  );
  return (
    <section className="stack">
      <p className="eyebrow">Account</p>
      <h1>Security</h1>
      <p className="lede">Password and sessions for {actor.email}.</p>
      <section className="card stack">
        <h2>Password</h2>
        <PasswordForm />
      </section>
      <section className="card stack">
        <h2>Sessions</h2>
        <SessionList
          sessions={settings.sessions.map((session) => ({
            id: session.id,
            userAgent: session.userAgent ?? null,
            current: session.current,
            createdAt: new Date(session.createdAt).toISOString(),
          }))}
        />
      </section>
      <PrivacyCard
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
