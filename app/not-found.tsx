import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";

/**
 * Rendered when notFound() is called or a route doesn't exist (e.g. an
 * invalid /match/[id] slug). Keeps the app chrome (top bar, bottom nav)
 * so the user can navigate without going through the browser.
 */
export default function NotFound() {
  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in flex flex-col items-center justify-center text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-container/30 to-secondary-container/30 blur-3xl rounded-full" />
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-[0_0_40px_rgba(255,107,0,0.4)]">
            <span className="material-symbols-outlined text-white text-[36px]">
              search_off
            </span>
          </div>
        </div>

        <span className="font-display-lg text-[40px] leading-none text-on-surface mb-2">
          404
        </span>
        <h1 className="font-headline-md text-[18px] text-on-surface mb-2">
          Página não encontrada
        </h1>
        <p className="font-body-md text-[14px] text-on-surface-variant mb-6 max-w-[300px]">
          Este jogo não existe ou foi removido. Volte ao início e busque outro.
        </p>

        <Link
          href="/"
          className="bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-3 px-6 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          Voltar ao início
        </Link>
      </main>

      <BottomNavBar />
    </>
  );
}
