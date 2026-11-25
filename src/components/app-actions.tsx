"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { TextField } from "@/components/shell";
import { DocumentOptionalDetails, DocumentTrustNote } from "@/components/document-upload";
import { DOCUMENT_KINDS } from "@/server/domain/validation";

export function InvitationActions({ invitation }: { invitation: { id: string; status: string } | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  if (!invitation) return null;
  return (
    <div className="actions">
      {invitation.status === "draft" || invitation.status === "send_failed" ? (
        <button className="primary" type="button" onClick={async () => {
          const result = await api<{ delivery?: string }>(`/api/invitations/${invitation.id}/send`, { method: "POST" });
          setMessage(result.ok ? (result.data.delivery === "dev-sink" ? "Stored in the local outbox. Not delivered to an inbox." : result.data.delivery === "unconfigured" ? "Not sent." : "Send requested.") : result.data.error.message);
          router.refresh();
        }}>Send invitation</button>
      ) : null}
      {invitation.status === "draft" || invitation.status === "sent" || invitation.status === "send_failed" ? (
        <button className="secondary" type="button" onClick={async () => {
          const result = await api(`/api/invitations/${invitation.id}/cancel`, { method: "POST" });
          setMessage(result.ok ? "Invitation canceled. It cannot be reused." : result.data.error.message);
          router.refresh();
        }}>Cancel invitation</button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function RevokeButton({ patientId, userId, label }: { patientId: string; userId: string; label: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div className="actions">
      <button className="danger" type="button" onClick={async () => {
        const result = await api(`/api/patients/${patientId}/grants/revoke`, { method: "POST", body: { userId } });
        setMessage(result.ok ? "Access revoked." : result.data.error.message);
        router.refresh();
      }}>{label}</button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function MemberAdmin({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form className="stack" onSubmit={async (event) => {
      event.preventDefault();
      const result = await api<{ userId: string }>("/api/household/members", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: { email, adminRole: "member" },
      });
      if (!result.ok) {
        setMessage(result.data.error.message);
        return;
      }
      setMessage("Added to household administration. This does not grant patient record access.");
      setEmail("");
      router.refresh();
    }}>
      <TextField id="member-email" label="Verified account email" type="email" value={email} onChange={setEmail} />
      <button className="secondary" type="submit">Add household member</button>
      {message ? <p role="status">{message}</p> : null}
      <p className="muted">Signed in as account {currentUserId.slice(0, 8)}.</p>
    </form>
  );
}

export function RemoveMemberButton({ userId }: { userId: string }) {
  const router = useRouter();
  return (
    <button className="secondary" type="button" onClick={async () => {
      await api("/api/household/members/remove", { method: "POST", body: { userId } });
      router.refresh();
    }}>Remove from household</button>
  );
}

export function PreferencesForm({ preferences }: { preferences: { timeZone: string; locale: string } }) {
  const [timeZone, setTimeZone] = useState(preferences.timeZone);
  const [locale, setLocale] = useState(preferences.locale);
  const [message, setMessage] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await api("/api/settings/preferences", { method: "POST", body: { timeZone, locale } });
        setMessage(result.ok ? "Preferences saved." : result.data.error.message);
      }}
    >
      <TextField id="timeZone" label="Time zone" value={timeZone} onChange={setTimeZone} />
      <TextField id="locale" label="Locale" value={locale} onChange={setLocale} />
      {message ? <p role="status">{message}</p> : null}
      <button className="secondary" type="submit">Save preferences</button>
    </form>
  );
}

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage("");
        const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
        setPending(false);
        if (result.error) {
          setMessage(result.error.message || "The password could not be changed.");
          return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setMessage("Password updated.");
      }}
    >
      <TextField id="currentPassword" label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={setCurrentPassword} />
      <TextField id="newPassword" label="New password" type="password" autoComplete="new-password" required value={newPassword} onChange={setNewPassword} />
      <p className="muted">Use at least 12 characters. This does not sign out other sessions.</p>
      {message ? <p role="status">{message}</p> : null}
      <button className="primary" type="submit" disabled={pending}>{pending ? "Saving" : "Update password"}</button>
    </form>
  );
}

export function SessionList({ sessions }: { sessions: Array<{ id: string; userAgent: string | null; current: boolean; createdAt: string }> }) {
  const router = useRouter();
  return (
    <ul className="list">
      {sessions.map((session) => (
        <li key={session.id} className="split">
          <span>{session.current ? "This session" : "Other session"} · {session.userAgent || "Unknown device"}</span>
          {!session.current ? (
            <button className="secondary" type="button" onClick={async () => {
              await api(`/api/settings/sessions/${session.id}/revoke`, { method: "POST" });
              router.refresh();
            }}>Revoke</button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function GoogleLinkCard({ providers, googleLinkAvailable }: { providers: string[]; googleLinkAvailable: boolean }) {
  return (
    <section className="card stack">
      <h2>Google</h2>
      <p>{providers.includes("google") ? "Google is linked to this account." : "Google is not linked."}</p>
      {googleLinkAvailable && !providers.includes("google") ? (
        <button className="secondary" type="button" onClick={() => authClient.linkSocial({ provider: "google", callbackURL: "/app/account/security" })}>
          Link Google while signed in
        </button>
      ) : null}
      {!googleLinkAvailable ? <p className="muted">Google sign-in is not configured, so linking cannot succeed.</p> : null}
    </section>
  );
}

export function PrivacyCard({ privacyRequests }: { privacyRequests: Array<{ id: string; kind: string; status: string; detail: string }> }) {
  const [message, setMessage] = useState("");
  return (
    <section className="card stack">
      <h2>Export and deletion</h2>
      <p className="muted">Requests stay open. This version does not generate an export or erase data.</p>
      <ul className="list">
        {privacyRequests.map((item) => (
          <li key={item.id} className="card">
            <strong>{item.kind === "deletion" ? "Deletion" : "Export"} · {item.status}</strong>
            <p className="muted">{item.detail}</p>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="secondary" type="button" onClick={async () => setMessage(await requestPrivacy("export"))}>Request export</button>
        <button className="danger" type="button" onClick={async () => setMessage(await requestPrivacy("deletion"))}>Request deletion</button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

export function DocumentUploadForm({ visitId, storageConfigured }: { visitId: string; storageConfigured: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [kind, setKind] = useState("bill");
  const [detailsKey, setDetailsKey] = useState(0);
  if (!storageConfigured) {
    return <p className="muted">Visit details are saved. Document storage is not configured yet.</p>;
  }
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        setMessage("");
        let response: Response;
        try {
          response = await fetch(`/api/visits/${visitId}/documents`, {
            method: "POST",
            body: new FormData(form),
            credentials: "same-origin",
          });
        } catch {
          setPending(false);
          setMessage("We couldn't reach CareUnfold. Nothing was stored.");
          return;
        }
        const data = (await response.json()) as { documents?: Array<{ id: string }>; error?: { message: string } };
        setPending(false);
        if (!response.ok) {
          setMessage(data.error?.message ?? "The documents were not stored.");
          return;
        }
        form.reset();
        setFileCount(0);
        setKind("bill");
        setDetailsKey((current) => current + 1);
        router.refresh();
      }}
    >
      <label htmlFor="kind">Document type</label>
      <select id="kind" name="kind" required value={kind} onChange={(event) => setKind(event.target.value)}>
        {DOCUMENT_KINDS.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
      <label htmlFor="file">Files (PDF or image, 4 MB or smaller each)</label>
      <input
        id="file"
        name="file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple
        required
        onChange={(event) => setFileCount(event.currentTarget.files?.length ?? 0)}
      />
      <p className="muted">Select more than one file of the same type, such as two facility bills. To add an adjusted bill, choose Adjusted bill and upload it separately.</p>
      {fileCount > 1 ? <p role="status">{fileCount} files selected.</p> : null}
      <DocumentTrustNote />
      <DocumentOptionalDetails key={detailsKey} showEob={kind !== "eob"} />
      {message ? <p role="status">{message}</p> : null}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Uploading" : fileCount > 1 ? `Upload ${fileCount} files` : "Upload"}
      </button>
    </form>
  );
}

async function requestPrivacy(kind: "export" | "deletion") {
  const result = await api<{ request: { detail: string } }>("/api/settings/privacy-requests", { method: "POST", body: { kind } });
  return result.ok ? result.data.request.detail : result.data.error.message;
}

export function InvitationResponse({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div className="actions">
      <button className="primary" type="button" onClick={async () => respond("accept")}>Accept</button>
      <button className="secondary" type="button" onClick={async () => respond("reject")}>Reject</button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );

  async function respond(action: "accept" | "reject") {
    const result = await api(`/api/invitation-links/${token}/${action}`, { method: "POST" });
    if (!result.ok) {
      setMessage(result.data.error.message);
      return;
    }
    router.push("/app");
    router.refresh();
  }
}
