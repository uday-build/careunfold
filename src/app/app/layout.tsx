import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { AppSidebar } from "@/components/app-sidebar";
import { currentActor } from "@/server/auth/current";

export default async function AppSectionLayout({ children }: { children: React.ReactNode }) {
  const { actor } = await currentActor();
  return (
    <div className="workspace">
      <header className="workspace-top">
        <Link className="brand" href="/app/family">CareUnfold</Link>
        <AccountHeader signedIn={Boolean(actor)} isAdmin={actor?.role === "admin"} />
      </header>
      <div className="workspace-body">
        <AppSidebar />
        <main id="main" className="workspace-main">{children}</main>
      </div>
    </div>
  );
}
