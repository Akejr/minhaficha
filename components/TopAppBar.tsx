import Link from "next/link";
import { getCurrentSession } from "@/lib/supabase/session";

/**
 * Top bar shown on every page. Right-side badge state depends on auth + plan:
 *
 *   - logged out                       → "Entrar"  (links to /entrar)
 *   - logged in, free plan / expired   → "Grátis"  (links to /perfil)
 *   - logged in, weekly or monthly     → "PRO"     (links to /perfil)
 *
 * The session lookup is memoised per-request via React.cache, so calling
 * getCurrentSession() here AND inside the page component costs only one
 * Supabase round-trip total.
 */
export async function TopAppBar() {
  const { user, plan } = await getCurrentSession();

  let badge: BadgeState;
  if (!user) badge = { kind: "guest" };
  else if (plan === "free") badge = { kind: "free" };
  else badge = { kind: "pro" };

  return (
    <header
      className="fixed left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/60 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(255,107,0,0.15)] flex justify-between items-center px-6"
      style={{
        top: 0,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
        paddingBottom: 16,
      }}
    >
      <Link
        href="/"
        prefetch
        className="flex items-center gap-3 hover:opacity-80 transition-opacity active:scale-95 duration-200"
      >
        <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold bg-gradient-to-r from-primary-container to-secondary-container bg-clip-text text-transparent">
          Ficha AI
        </span>
      </Link>
      <Badge state={badge} />
    </header>
  );
}

type BadgeState = { kind: "guest" } | { kind: "free" } | { kind: "pro" };

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
  if (state.kind === "free") {
    return (
      <Link
        href="/perfil"
        prefetch
        className="bg-surface-container/80 text-on-surface-variant border border-white/10 rounded-full px-4 py-1.5 font-label-md text-label-md uppercase tracking-wider hover:opacity-80 transition-opacity active:scale-95 duration-200"
      >
        Grátis
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
