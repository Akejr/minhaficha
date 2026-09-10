import Link from "next/link";
import { getCurrentAccess } from "@/lib/access/session";

/**
 * Top bar shown on every page. The right-hand badge reflects access state:
 *
 *   - no code            → "Entrar"      (links to /entrar)
 *   - active paid code   → "PRO"         (links to /perfil)
 *   - permanent code     → "VIP"         (links to /perfil)
 *
 * getCurrentAccess() is memoised per request via React.cache, so calling it
 * here and in the page costs a single lookup.
 */
export async function TopAppBar() {
  const access = await getCurrentAccess();

  const badge: BadgeState = !access
    ? { kind: "guest" }
    : access.isPermanent
      ? { kind: "vip" }
      : { kind: "pro" };

  return (
    <header
      className="fixed left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/60 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(255,107,0,0.15)] flex justify-between items-center px-6"
      style={{
        // Sits at 0, or just below the promo strip when it's present. When the
        // promo shows, the strip already carries the safe-area inset, so the
        // header only needs its own 16px padding.
        top: "var(--promo-height)",
        paddingTop:
          "calc(var(--promo-header-inset, env(safe-area-inset-top, 0px)) + 16px)",
        paddingBottom: 16,
      }}
    >
      <Link
        href="/"
        prefetch
        className="flex items-center gap-3 hover:opacity-80 transition-opacity active:scale-95 duration-200"
      >
        <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold bg-gradient-to-r from-primary-container to-secondary-container bg-clip-text text-transparent">
          ApostAI
        </span>
      </Link>
      <Badge state={badge} />
    </header>
  );
}

type BadgeState = { kind: "guest" } | { kind: "pro" } | { kind: "vip" };

function Badge({ state }: { state: BadgeState }) {
  if (state.kind === "guest") {
    return (
      <Link
        href="/entrar"
        prefetch
        className="bg-primary-container/20 text-primary-container border border-primary-container/30 rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider hover:opacity-80 transition-opacity active:scale-95 duration-200"
      >
        Entrar
      </Link>
    );
  }
  if (state.kind === "vip") {
    return (
      <Link
        href="/perfil"
        prefetch
        className="bg-gradient-to-r from-emerald-500 to-primary-container text-white border border-emerald-400/40 rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity active:scale-95 duration-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
      >
        VIP
      </Link>
    );
  }
  return (
    <Link
      href="/perfil"
      prefetch
      className="bg-gradient-to-r from-primary-container to-secondary-container text-white border border-primary-container/40 rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity active:scale-95 duration-200 shadow-[0_0_12px_rgba(255,107,0,0.3)]"
    >
      Pro
    </Link>
  );
}
