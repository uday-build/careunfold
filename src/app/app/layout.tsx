import { AccountNav } from "@/components/account-nav";
import { Shell } from "@/components/app-shell";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <div className="split">
        <AccountNav />
      </div>
      {children}
    </Shell>
  );
}
