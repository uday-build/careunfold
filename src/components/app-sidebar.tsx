"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/app/family",
    label: "Family",
    detail: "Setup and relationship graph",
  },
  {
    href: "/app/visits",
    label: "Visits",
    detail: "Previous visits and new ones",
  },
  {
    href: "/app/billing",
    label: "Billing / Plan",
    detail: "Packages and invoices",
  },
  {
    href: "/app/account",
    label: "Account",
    detail: "Profile, contact, and security",
    children: [
      { href: "/app/account", label: "Profile" },
      { href: "/app/account/contact", label: "Contact" },
      { href: "/app/account/security", label: "Security" },
    ],
  },
];

function isCurrent(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const navItems = isAdmin
    ? [
        ...items,
        { href: "/app/admin", label: "Admin", detail: "Incoming access requests" },
      ]
    : items;
  return (
    <nav className="sidebar" aria-label="Workspace">
      {navItems.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <div className={current ? "sidebar-group is-current" : "sidebar-group"} key={item.href}>
            <Link href={item.href} aria-current={current && !item.children ? "page" : undefined}>
              <span>{item.label}</span>
              <span className="sidebar-detail">{item.detail}</span>
            </Link>
            {item.children ? (
              <div className="sidebar-children">
                {item.children.map((child) => {
                  const childCurrent = isCurrent(pathname, child.href, true);
                  return (
                    <Link key={child.href} href={child.href} aria-current={childCurrent ? "page" : undefined}>
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
