import Link from "next/link";
import { SignOutButton } from "@/components/auth-forms";
import { currentActor } from "@/server/auth/current";

export const dynamic = "force-dynamic";

const included = [
  "Create a household profile",
  "Record people, relationships, and coverage",
  "Analyze documents for one visit",
  "See matches, gaps, and uncertain items",
];

const plans = [
  {
    name: "Per visit",
    price: "$29.99",
    cadence: "one visit",
    detail: "Guided work through a single visit when a bill arrives.",
    points: ["One visit package", "Documents stay on that visit", "Draft a question when you choose"],
    featured: false,
  },
  {
    name: "Monthly",
    price: "$14.99",
    cadence: "per month",
    detail: "Ongoing help when bills and explanations keep arriving.",
    points: ["Visit work through the month", "Household profile included", "Cancel when you do not need it"],
    featured: false,
  },
  {
    name: "Yearly",
    price: "$149.99",
    cadence: "per year",
    detail: "The same monthly work, billed once. Two months are included.",
    points: ["Twelve months of visit work", "Household profile included", "Best when care is ongoing"],
    featured: true,
  },
];

const howSteps = [
  {
    name: "Bring one visit together",
    detail: "Upload the provider bill, insurance explanation, and payment record. CareUnfold reads what it can and asks you to confirm the visit details.",
    visual: "extract",
  },
  {
    name: "Compare the records you have",
    detail: "Charges are placed on the visit they belong to. Matches, missing records, and uncertain payments stay labeled. Nothing is inferred to look complete.",
    visual: "compare",
  },
  {
    name: "Decide with the evidence",
    detail: "See what the documents support, and what they do not. You can draft a factual question for a billing team. Nothing is sent automatically.",
    visual: "decide",
  },
];

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
          <a className="m-link" href="#how-it-works">How it works</a>
          <a className="m-link" href="#pricing">Pricing</a>
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

        <section className="m-included" id="start-free" aria-labelledby="included-heading">
          <div className="m-included-card">
            <p className="m-kicker">Start free</p>
            <h2 id="included-heading">Create a profile and analyze at no charge.</h2>
            <p>You can set up a household and look at a visit before you choose a package. Access is reviewed first. CareUnfold does not take a share of any amount on a bill.</p>
            <ul className="m-included-points">
              {included.map((item) => (
                <li key={item}>
                  <span className="m-check" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link className="m-btn m-btn-primary" href={continueHref}>{continueLabel}</Link>
          </div>
        </section>

        <section className="m-pricing" id="pricing" aria-labelledby="pricing-heading">
          <p className="m-kicker">Pricing</p>
          <h2 id="pricing-heading">Pay when you want guided work on a visit.</h2>
          <p className="m-lead">Profile setup and analysis stay free. Choose a visit package once, or subscribe if bills keep arriving.</p>
          <div className="m-plans">
            {plans.map((plan) => (
              <article className={plan.featured ? "m-plan m-plan-featured" : "m-plan"} key={plan.name} aria-labelledby={`plan-${plan.name.replaceAll(" ", "-").toLowerCase()}`}>
                <p className="m-kicker">{plan.featured ? "Billed yearly" : "Package"}</p>
                <h3 id={`plan-${plan.name.replaceAll(" ", "-").toLowerCase()}`}>{plan.name}</h3>
                <p className="m-plan-price">
                  <span>{plan.price}</span>
                  <span className="m-muted"> {plan.cadence}</span>
                </p>
                <p className="m-plan-detail">{plan.detail}</p>
                <ul>
                  {plan.points.map((point) => (
                    <li key={point}>
                      <span className="m-check" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link className={plan.featured ? "m-btn m-btn-primary" : "m-btn m-btn-secondary"} href={continueHref}>{continueLabel}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="m-how" id="how-it-works">
          <p className="m-kicker">How it works</p>
          <h2>A guided path through the evidence</h2>
          <p className="m-lead">
            CareUnfold walks a visit from the documents you have to a decision you can stand behind. Consequential actions stay with you.
          </p>
          <ol className="m-how-steps">
            {howSteps.map((step, index) => (
              <li className={index === 1 ? "m-how-step m-how-step-reverse" : "m-how-step"} key={step.name}>
                <div className="m-how-copy">
                  <span className="m-stage-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.name}</h3>
                  <p>{step.detail}</p>
                  <Link className="m-btn m-btn-primary" href={continueHref}>{continueLabel}</Link>
                </div>
                <HowItWorksVisual kind={step.visual} />
              </li>
            ))}
          </ol>
          <p className="m-kicker m-stages-kicker">The six stages</p>
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
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Request access</Link>
        </div>
      </footer>
    </div>
  );
}

function HowItWorksVisual({ kind }: { kind: string }) {
  if (kind === "extract") {
    return (
      <article className="m-product-card" aria-label="Example documents for one visit">
        <header>
          <p className="m-kicker">Visit documents</p>
          <p className="m-product-title">Imaging follow-up</p>
          <p className="m-muted">March 12 · three records on one visit</p>
        </header>
        <ul>
          <li><span className="m-dot" /> Provider bill uploaded</li>
          <li><span className="m-dot" /> Insurance explanation uploaded</li>
          <li><span className="m-dot m-dot-accent" /> Payment record needs confirmation</li>
        </ul>
        <p className="m-note">Visit details stay unconfirmed until you review what was read.</p>
      </article>
    );
  }

  if (kind === "compare") {
    return (
      <article className="m-product-card" aria-label="Example comparison of visit records">
        <header>
          <p className="m-kicker">Comparison</p>
          <p className="m-product-title">Your visit</p>
          <p className="m-muted">Charges stay on the visit they belong to</p>
        </header>
        <ul>
          <li><span className="m-dot" /> Office visit matches the explanation</li>
          <li><span className="m-dot" /> Imaging charge is linked</li>
          <li><span className="m-dot m-dot-accent" /> Facility fee is still uncertain</li>
        </ul>
        <p className="m-note">Gaps stay marked. CareUnfold does not fill missing amounts.</p>
      </article>
    );
  }

  return (
    <article className="m-product-card" aria-label="Example decision on a visit">
      <header>
        <p className="m-kicker">Decision</p>
        <p className="m-product-title">Draft a question</p>
        <p className="m-muted">You send it, or you do not</p>
      </header>
      <ul>
        <li><span className="m-dot" /> Evidence supports the matched charges</li>
        <li><span className="m-dot m-dot-accent" /> One line item is still open</li>
        <li><span className="m-dot" /> A factual question is ready to review</li>
      </ul>
      <p className="m-note">Nothing is sent to a billing team unless you choose to send it.</p>
    </article>
  );
}
