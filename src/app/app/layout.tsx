import { AccountNav } from "@/components/account-nav";
import { SignOutButton } from "@/components/auth-forms";
import { Shell } from "@/components/shell";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <div className="split">
        <AccountNav />
        <SignOutButton />
      </div>
      {children}
    </Shell>
  );
}
