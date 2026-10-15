import Link from "next/link";
import { SignOutButton } from "@/components/auth-forms";
import { currentActor } from "@/server/auth/current";

export const dynamic = "force-dynamic";

const stages = [
  { name: "Extraction", detail: "Upload documents and confirm the visit details that were read from them." },
  { name: "Explanation", detail: "Understand charges in the context of the visit and the coverage on file." },
  { name: "Reconciliation", detail: "Connect provider bills, insurance explanations, and payment records." },
  { name: "Decision", detail: "See where evidence supports a conclusion, and where it does not." },
  { name: "Output", detail: "Keep a record of what was compared, confirmed, and left open." },
  { name: "Email drafting", detail: "Compose factual questions for billing teams. Nothing is sent automatically." },
];

export default async function HomePage() {
  const { actor } = await currentActor();
  const continueHref = !actor
    ? "/sign-up"
    : !actor.emailVerified
      ? "/verify-email"
      : actor.accessStatus !== "approved"
        ? "/pending-access"
        : "/auth/continue";
  const continueLabel = !actor
    ? "Request access"
    : !actor.emailVerified
      ? "Verify email"
      : actor.accessStatus !== "approved"
        ? "Access pending"
        : "Continue";

  return (
    <div className="marketing">
      <header className="m-nav">
        <Link className="m-logo" href="/">CareUnfold</Link>
        <div className="m-nav-actions">
          {actor?.role === "admin" ? <Link className="m-link" href="/app/admin">Admin</Link> : null}
          {actor ? (
            <>
              <Link className="m-btn m-btn-secondary" href={continueHref}>{continueLabel}</Link>
              <SignOutButton className="m-btn m-btn-outline" />
            </>
          ) : (
            <>
              <Link className="m-btn m-btn-outline" href="/sign-in">Sign in</Link>
              <Link className="m-btn m-btn-secondary" href="/sign-up">Request access</Link>
            </>
          )}
        </div>
      </header>

      <main id="main">
        <section className="m-hero">
          <div className="m-hero-panel">
            <div className="m-hero-copy">
              <h1>Don’t pay that medical bill until you can see what it means.</h1>
              <p>
                Medical billing is fragmented and difficult to navigate. Patients and caregivers must connect provider bills, insurance explanations and payment records, work out which charges belong to which visit, and decide whether something needs clarification.
              </p>
              <div className="m-hero-actions">
                <Link className="m-btn m-btn-primary" href={continueHref}>{continueLabel}</Link>
                <a className="m-btn m-btn-ghost" href="#how-it-works">See how it works</a>
              </div>
            </div>
            <div className="m-hero-photo">
              <img src="/marketing/hero-review.jpg" alt="A person reviewing documents at a table in daylight." />
            </div>
          </div>

          <div className="m-evidence">
            <div className="m-evidence-copy">
              <h2>See what the evidence supports</h2>
              <p>CareUnfold guides you through a visit: what was extracted, what matches, and what is still uncertain. Consequential actions stay with you.</p>
            </div>
            <article className="m-product-card" aria-label="Example visit review">
              <header>
                <p className="m-kicker">Visit review</p>
                <p className="m-product-title">Imaging follow-up</p>
                <p className="m-muted">March 12 · one visit, three documents</p>
              </header>
              <ul>
                <li><span className="m-dot" /> Provider bill linked</li>
                <li><span className="m-dot" /> Insurance explanation matched</li>
                <li><span className="m-dot m-dot-accent" /> Payment record needs confirmation</li>
              </ul>
              <p className="m-note">One line item is marked uncertain. No amount is treated as settled without evidence.</p>
              <Link className="m-btn m-btn-primary m-btn-full" href={continueHref}>Review this visit</Link>
            </article>
          </div>
        </section>

        <section className="m-stats" aria-label="How CareUnfold is built">
          <div>
            <p className="m-stat">6</p>
            <p>Guided stages from extraction to a draft question</p>
          </div>
          <div>
            <p className="m-stat">Human</p>
            <p>Control stays with you. Nothing is sent on its own.</p>
          </div>
          <div>
            <p className="m-stat">Evidence</p>
            <p>Missing records and uncertain payments stay marked</p>
          </div>
        </section>

        <section className="m-how" id="how-it-works">
          <p className="m-kicker">How it works</p>
          <h2>A guided path through the evidence</h2>
          <p className="m-lead">
            CareUnfold is a conversational AI prototype that guides users through uploading documents, confirming extracted visit details, understanding charges and reconciling available evidence. It helps identify possible discrepancies and compose factual questions for billing teams, while keeping consequential actions under human control.
          </p>
          <ol className="m-stages">
            {stages.map((stage, index) => (
              <li key={stage.name}>
                <span className="m-stage-num">{String(index + 1).padStart(2, "0")}</span>
                <h3>{stage.name}</h3>
                <p>{stage.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="m-compare">
          <article className="m-compare-card">
            <p className="m-kicker">Before</p>
            <h2>Scattered records</h2>
            <ul>
              <li>Bills, explanations, and payments live in different places</li>
              <li>Charges are not tied to a visit</li>
              <li>It is hard to know what needs clarification</li>
            </ul>
          </article>
          <article className="m-compare-card m-compare-dark">
            <p className="m-kicker">With CareUnfold</p>
            <h2>One visit, compared</h2>
            <ul>
              <li>Documents sit on the visit they belong to</li>
              <li>Matches, gaps, and uncertain items are labeled</li>
              <li>A factual question can be drafted, not sent</li>
            </ul>
            <Link className="m-btn m-btn-primary" href={continueHref}>{continueLabel}</Link>
          </article>
        </section>

        <section className="m-work">
          <p className="m-kicker">Product work</p>
          <h2>Designed as distinct stages, with explicit limits</h2>
          <p>
            My work spans problem definition, product requirements, conversational UX, agent responsibilities and evaluation design. I’ve designed distinct extraction, explanation, reconciliation, decision, output and email-drafting stages, with explicit boundaries for missing evidence, uncertain payments and unauthorized records.
          </p>
        </section>

        <section className="m-band">
          <h2>Ready to make medical billing easier to navigate?</h2>
          <p>Access is reviewed before anyone can continue.</p>
          <Link className="m-btn m-btn-primary" href={continueHref}>{continueLabel}</Link>
        </section>
      </main>

      <footer className="m-footer">
        <Link className="m-logo" href="/">CareUnfold</Link>
        <p>A conversational prototype. Access is granted after review.</p>
        <div className="m-footer-links">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Request access</Link>
        </div>
      </footer>
    </div>
  );
}
