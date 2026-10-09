"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="shell">
      <section className="hero stack">
        <h1>Something went wrong</h1>
        <p role="alert">Error: CareUnfold could not finish that request. Nothing new was confirmed.</p>
        <button className="primary" type="button" onClick={() => reset()}>Try again</button>
      </section>
    </main>
  );
}
