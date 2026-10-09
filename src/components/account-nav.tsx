"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Home" },
  { href: "/app/family", label: "Family" },
  { href: "/app/coverage", label: "Coverage" },
  { href: "/app/settings", label: "Settings" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Account">
      {items.map((item) => {
        const current = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
