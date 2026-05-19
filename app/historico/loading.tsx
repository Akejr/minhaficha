import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";

/**
 * Skeleton shown by Next.js while /historico awaits its Supabase queries.
 * Matches the real layout so there's no jump when data lands.
 */
export default function HistoryLoading() {
  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in">
        <Shimmer className="h-7 w-44 mb-2" />
        <Shimmer className="h-4 w-32 mb-6" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <article key={i} className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <Shimmer className="h-3 w-24" />
                <Shimmer className="h-3 w-20" />
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-white/[0.06]" />
                <Shimmer className="h-4 flex-1" />
                <Shimmer className="h-3 w-6" />
                <Shimmer className="h-4 flex-1" />
                <div className="w-7 h-7 rounded-full bg-white/[0.06]" />
              </div>
              <Shimmer className="h-3 w-full" />
            </article>
          ))}
        </div>
      </main>

      <BottomNavBar />
    </>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.04] bg-[length:400%_100%] animate-shimmer rounded ${className}`}
    />
  );
}
