import { notFound } from "next/navigation";
import { Shell } from "@/components/app-shell";
import { Notice } from "@/components/shell";
import { getContext } from "@/server/context";
import { getDevOutbox } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export default async function DevOutboxPage() {
  try {
    const outbox = await getDevOutbox(getContext());
    return (
      <Shell>
        <section className="stack">
          <h1>Local email outbox</h1>
          <Notice tone="info" title="Not delivered">{outbox.notice}</Notice>
          <ul className="list">
            {outbox.messages.map((message) => (
              <li className="card stack" key={message.id}>
                <strong>{message.subject}</strong>
                <div>To {message.recipient}</div>
                <div className="muted">{message.purpose} · {new Date(message.createdAt).toISOString()}</div>
                <pre>{message.body}</pre>
              </li>
            ))}
          </ul>
          {outbox.messages.length === 0 ? <p>No local messages yet.</p> : null}
        </section>
      </Shell>
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
