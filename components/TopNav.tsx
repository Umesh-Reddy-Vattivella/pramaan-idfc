"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Smartphone,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string | null; // null => disabled until a case is selected
  icon: LucideIcon;
  active: boolean;
}

export default function TopNav() {
  const pathname = usePathname() ?? "/";

  // Case-scoped tabs (Workbench / Report) resolve from the current case id.
  const caseMatch = pathname.match(/^\/cases\/([^/]+)/);
  const caseId = caseMatch ? decodeURIComponent(caseMatch[1]) : null;
  const onReport = /^\/cases\/[^/]+\/report/.test(pathname);

  const items: NavItem[] = [
    { label: "Portfolio Command Center", href: "/", icon: LayoutDashboard, active: pathname === "/" },
    { label: "Owner Self-Capture", href: "/capture", icon: Smartphone, active: pathname.startsWith("/capture") },
    {
      label: "Underwriter Workbench",
      href: caseId ? `/cases/${encodeURIComponent(caseId)}` : null,
      icon: ClipboardCheck,
      active: !!caseId && !onReport,
    },
    {
      label: "IDFC Report & e-Sign",
      href: caseId ? `/cases/${encodeURIComponent(caseId)}/report` : null,
      icon: FileText,
      active: onReport,
    },
  ];

  return (
    <header className="sticky top-0 z-[1000] bg-maroon text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold tracking-wide">PRAMAAN</span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-white/70">
              IDFC FIRST Bank · LAP Valuation
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto" aria-label="Primary">
          {items.map(({ label, href, icon: Icon, active }) => {
            const base =
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
            if (!href) {
              return (
                <span
                  key={label}
                  title="Open a case from the Portfolio Command Center"
                  className={`${base} cursor-not-allowed text-white/40`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </span>
              );
            }
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`${base} ${
                  active ? "bg-maroon-deep text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold md:inline-flex">
          <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden />
          Demo Mode
        </span>
      </div>
    </header>
  );
}
