import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { currentActor } from "@/server/auth/current";

export async function Shell({
  children,
  nav,
}: {
  children: React.ReactNode;
  nav?: Array<{ href: string; label: string; current?: boolean }>;
}) {
  const { actor } = await currentActor();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CareUnfold</Link>
        <div className="row">
          {nav ? (
            <nav className="nav" aria-label="Account">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} aria-current={item.current ? "page" : undefined}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <AccountHeader signedIn={Boolean(actor)} isAdmin={actor?.role === "admin"} />
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
