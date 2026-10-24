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
      <div className="review-wrap">
      <table className="review-table">
        <caption className="visually-hidden">Incoming access requests</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Requested</th>
            <th scope="col">Decision</th>
          </tr>
        </thead>
        <tbody>
          {users.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name || item.email}</strong>
                <div className="muted">{item.email}</div>
                <div className="muted">{providerLabel(item.providers)}</div>
              </td>
              <td>{formatRequested(item.createdAt)}</td>
              <td>
                {item.id === currentUserId || item.role === "admin" ? (
                  <p className="muted">Administrator</p>
                ) : (
                  <div className="actions">
                    <button className="primary" type="button" disabled={pendingId === item.id} onClick={() => decide(item.id, "approved")}>
                      Approve
                    </button>
                    <button className="danger" type="button" disabled={pendingId === item.id} onClick={() => decide(item.id, "denied")}>
                      Deny
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function formatRequested(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function providerLabel(providers: string[]): string {
  if (providers.includes("google") && providers.includes("credential")) return "Google and email";
  if (providers.includes("google")) return "Google";
  if (providers.includes("credential")) return "Email and password";
  return "No sign-in method stored";
}
