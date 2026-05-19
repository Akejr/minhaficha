"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  match?: (path: string) => boolean;
};

const items: NavItem[] = [
  {
    href: "/",
    label: "Início",
    icon: "home",
    match: (p) => p === "/" || p.startsWith("/match"),
  },
  { href: "/historico", label: "Histórico", icon: "history" },
  { href: "/perfil", label: "Perfil", icon: "person" },
];

/**
 * Bottom nav. Each item uses a Next <Link prefetch> so the destination
 * route is preloaded on hover/touchstart. Combined with loading.tsx files
 * in /perfil and /historico, the user sees an immediate skeleton instead
 * of waiting for the server to finish.
 */
export function BottomNavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/80 backdrop-blur-xl rounded-t-xl border-t border-white/5 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] flex justify-around items-center px-4 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
      {items.map((item) => {
        const isActive = item.match
          ? item.match(pathname)
          : pathname === item.href || pathname.startsWith(item.href + "/");

        const baseClasses =
          "flex flex-col items-center justify-center px-4 py-2 transition-all press relative";
        const activeClasses =
          "text-primary-container bg-gradient-to-b from-primary-container/10 to-transparent rounded-xl shadow-[0_0_15px_rgba(255,107,0,0.2)]";
        const inactiveClasses =
          "text-on-surface-variant opacity-60 hover:text-primary hover:opacity-100";

        return (
          <Link
            key={item.label}
            href={item.href}
            prefetch
            className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
          >
            <span
              className="material-symbols-outlined mb-1"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span className="font-label-md text-[10px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
