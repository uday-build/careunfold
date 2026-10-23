import Link from "next/link";
import { Notice } from "@/components/shell";
import { loadApp } from "../../load";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  await loadApp();
  return (
    <section className="stack">
      <p className="eyebrow">Cases</p>
      <h1>Cases</h1>
      <p className="lede">Each case starts with the details of one visit. Documents, comparison, and questions come after that visit is named.</p>
      <Notice tone="info" title="No cases yet">There are no visits on file. Starting a case does not contact a provider or create a bill.</Notice>
      <p>
        <Link className="button" href="/app/cases/new">Start a case</Link>
      </p>
    </section>
  );
}
