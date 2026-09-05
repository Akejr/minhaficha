"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Top-level error boundary. Next.js renders this when a Server / Client
 * component throws while rendering. The button retries the whole segment
 * (most transient errors disappear after one retry).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the browser console so we have something concrete to debug.
    console.error("[apostai] runtime error:", error);
  }, [error]);

  return (
    <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in flex flex-col items-center justify-center text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 bg-gradient-to-br from-error/40 to-primary-container/30 blur-3xl rounded-full" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-error to-primary-container flex items-center justify-center shadow-[0_0_40px_rgba(255,180,171,0.3)]">
          <span className="material-symbols-outlined text-white text-[36px]">
            error
          </span>
        </div>
      </div>

      <h1 className="font-headline-md text-[22px] text-on-surface mb-2">
        Algo deu errado
      </h1>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-6 max-w-[300px]">
        Tivemos um problema ao carregar esta página. Tente de novo em alguns
        segundos.
      </p>

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={() => reset()}
          className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Tentar de novo
        </button>
        <Link
          href="/"
          className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors py-2"
        >
          Voltar ao início
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono-data text-[10px] text-on-surface-variant/40">
          ref: {error.digest}
        </p>
      )}
    </main>
  );
}
