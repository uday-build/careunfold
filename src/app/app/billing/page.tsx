import { Notice } from "@/components/shell";
import { loadApp } from "../../load";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await loadApp();
  return (
    <section className="stack">
      <p className="eyebrow">Billing / Plan</p>
      <h1>Billing and plan</h1>
      <p className="lede">Packages and invoices will live here. Nothing is billed from this screen.</p>
      <Notice tone="info" title="No billing activity">There is no visit package or subscription on this account yet. Creating a profile and analyzing a visit stay free.</Notice>
    </section>
  );
}
