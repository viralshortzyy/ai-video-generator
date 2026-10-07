"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-forge-amber to-forge-ember shadow-glow"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="#0B0B0F" />
        <path d="M4 3.5 6.5 2 5 4.5 3.5 6 2 4.5 4 3.5Z" fill="#0B0B0F" opacity="0.55" />
      </svg>
    </span>
  );
}

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/history", label: "History" },
  { href: "/projects", label: "Projects" },
];

export function Header({ balance, userName }: { balance: number | null; userName: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-forge-line bg-forge-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight text-forge-cream">
            FrameForge
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-forge-panel2 text-forge-cream"
                    : "text-forge-mute hover:text-forge-cream"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 rounded-full border border-forge-line bg-forge-panel px-3 py-1.5 text-sm"
            title="Credits available for generation"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-forge-amber" />
            <span className="font-semibold text-forge-cream">{balance ?? "–"}</span>
            <span className="text-forge-mute">credits</span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forge-panel2 text-sm font-bold text-forge-amber">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm text-forge-mute">{userName}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
