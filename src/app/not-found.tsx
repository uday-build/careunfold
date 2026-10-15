import Link from "next/link";
import { Shell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <Shell>
      <section className="hero stack">
        <h1>That page is not available</h1>
        <p>The address may be wrong, or this part of CareUnfold is not in this version.</p>
        <Link className="button" href="/">Home</Link>
      </section>
    </Shell>
  );
}
