"use client";

import { usePathname } from "next/navigation";

/**
 * Floating WhatsApp support button.
 *
 * Placement notes:
 *   - The app is a centred 440px column, so a plain `fixed right-4` would
 *     glue the button to the browser edge on desktop, far from the content.
 *     Instead we mirror the TopAppBar/BottomNavBar trick: a full-width fixed
 *     wrapper capped at 440px and auto-centred, with the button pushed to its
 *     right edge.
 *   - It sits above the bottom nav using `--bottombar-height` from
 *     globals.css (which already accounts for the iOS safe area), so it can
 *     never cover the navigation.
 *   - The wrapper is pointer-events-none so the invisible strip doesn't eat
 *     taps meant for the content underneath; only the button itself is
 *     clickable.
 *
 * The message is pre-filled and, on a match page, carries the fixture id so
 * support knows which game the question is about.
 */

/** Support number in international format: +55 (19) 99925-4735 */
const WHATSAPP_NUMBER = "5519999254735";

function buildMessage(pathname: string): string {
  const base = "Olá! Tenho uma dúvida sobre o ApostAI";

  const match = pathname.match(/^\/match\/(\d+)/);
  if (match) return `${base} — sobre a análise do jogo #${match[1]}.`;
  if (pathname.startsWith("/perfil")) return `${base} — sobre a assinatura.`;
  if (pathname.startsWith("/entrar")) return `${base} — sobre o meu código de acesso.`;
  if (pathname.startsWith("/assinatura"))
    return `${base} — acabei de pagar e preciso de ajuda com o meu código.`;
  return `${base}.`;
}

export function WhatsAppButton() {
  const pathname = usePathname() || "/";
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    buildMessage(pathname),
  )}`;

  return (
    <div
      className="fixed left-0 right-0 mx-auto max-w-[440px] z-40 px-container-margin flex justify-end pointer-events-none"
      style={{ bottom: "calc(var(--bottombar-height) + 12px)" }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Tirar dúvida pelo WhatsApp"
        title="Tirar dúvida pelo WhatsApp"
        className="pointer-events-auto group flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-[0_4px_20px_rgba(37,211,102,0.45)] hover:shadow-[0_4px_26px_rgba(37,211,102,0.6)] transition-all press h-14 pl-4 pr-4 sm:hover:pr-5"
      >
        <WhatsAppGlyph />
        {/* Label stays hidden on touch layouts to keep the button compact,
            and reveals on hover where a pointer exists. */}
        <span className="hidden sm:group-hover:inline font-label-md text-label-md whitespace-nowrap">
          Dúvidas?
        </span>
      </a>
    </div>
  );
}

/**
 * WhatsApp mark as inline SVG — the project's Material Symbols icon font has
 * no brand glyphs, so this can't be an <span className="material-symbols-*">.
 */
function WhatsAppGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.347-.347.52-.52.174-.174.232-.298.347-.497.115-.198.057-.371-.058-.52-.115-.148-.643-1.55-.88-2.12-.234-.556-.472-.48-.646-.489l-.55-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}
