"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

type AccessUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  role: "admin" | "member";
  accessStatus: "pending" | "approved" | "denied";
  providers: string[];
  createdAt: string;
  accessReviewedAt: string | null;
};

export function AccessReviewList({ users, currentUserId }: { users: AccessUser[]; currentUserId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState("");

  async function decide(userId: string, decision: "approved" | "denied") {
    setMessage("");
    setPendingId(userId);
    const result = await api("/api/admin/users/" + userId + "/access", { method: "POST", body: { decision } });
    setPendingId("");
    if (!result.ok) {
      setMessage(result.data.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack">
      {message ? <p className="form-error" role="alert">Error: {message}</p> : null}
      <ul className="list">
        {users.map((item) => (
          <li className="card split" key={item.id}>
            <div className="stack">
              <strong>{item.name || item.email}</strong>
              <div className="muted">{item.email}</div>
              <div className="status">{item.accessStatus}{item.role === "admin" ? " · admin" : ""}{item.emailVerified ? "" : " · email not verified"}</div>
              <p className="muted">{providerLabel(item.providers)} · {new Date(item.createdAt).toISOString().slice(0, 10)}</p>
            </div>
            {item.id === currentUserId || item.role === "admin" ? (
              <p className="muted">Administrator</p>
            ) : (
              <div className="actions">
                <button className="primary" type="button" disabled={pendingId === item.id || item.accessStatus === "approved"} onClick={() => decide(item.id, "approved")}>
                  Approve
                </button>
                <button className="danger" type="button" disabled={pendingId === item.id || item.accessStatus === "denied"} onClick={() => decide(item.id, "denied")}>
                  Deny
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function providerLabel(providers: string[]): string {
  if (providers.includes("google") && providers.includes("credential")) return "Google and email";
  if (providers.includes("google")) return "Google";
  if (providers.includes("credential")) return "Email and password";
  return "No sign-in method stored";
}
