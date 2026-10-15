"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/auth-forms";

export function AccountHeader({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  return (
    <div className="row">
      {isAdmin ? (
        <nav className="nav" aria-label="Administration">
          <Link href="/app/admin">Admin</Link>
        </nav>
      ) : null}
      {signedIn ? <SignOutButton /> : <Link className="ghost" href="/sign-in">Sign in</Link>}
    </div>
  );
}
