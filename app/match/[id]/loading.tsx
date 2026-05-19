import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";

/**
 * Rendered automatically by Next.js while app/match/[id]/page.tsx awaits
 * the API + IA pipeline. Mirrors the final layout structure so there's no
 * jarring layout shift when the data arrives.
 */
export default function MatchLoading() {
  return (
    <>
      {/* Ambient neon lights */}
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern">
        <div className="flex flex-col gap-6">
          <MatchHeaderSkeleton />
          <AISummarySkeleton />
          <BetsSkeleton />
          <StatsSkeleton />
        </div>
      </main>

      <BottomNavBar />
    </>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  // Animated gradient bar: tailwind animate-pulse + glassy underlay.
  return (
    <div
      className={`bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.04] bg-[length:400%_100%] animate-shimmer rounded ${className}`}
    />
  );
}

function MatchHeaderSkeleton() {
  return (
    <section className="glass-card rounded-xl p-6 relative overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <Shimmer className="h-5 w-20" />
        <Shimmer className="h-5 w-32" />
      </div>
      <div className="grid grid-cols-3 items-center gap-4">
        <TeamSkeleton />
        <div className="flex items-center justify-center">
          <Shimmer className="h-8 w-12" />
        </div>
        <TeamSkeleton />
      </div>
    </section>
  );
}

function TeamSkeleton() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-white/[0.06] animate-pulse" />
      <Shimmer className="h-4 w-24 mt-3" />
    </div>
  );
}

function AISummarySkeleton() {
  return (
    <section className="glass-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <Shimmer className="h-5 w-32" />
        <Shimmer className="h-5 w-24" />
      </div>
      <div className="space-y-2">
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-4 w-11/12" />
        <Shimmer className="h-4 w-3/4" />
      </div>
      <Shimmer className="h-1 w-full mt-4" />
    </section>
  );
}

function BetsSkeleton() {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <Shimmer className="h-6 w-44" />
        <Shimmer className="h-4 w-20" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        {[0, 1, 2].map((i) => (
          <article key={i} className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <Shimmer className="h-5 w-24" />
              <Shimmer className="h-5 w-12" />
            </div>
            <Shimmer className="h-3 w-20 mb-2" />
            <Shimmer className="h-5 w-3/4 mb-4" />
            <Shimmer className="h-1.5 w-full mb-4" />
            <div className="space-y-2">
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-5/6" />
              <Shimmer className="h-3 w-4/6" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <section className="glass-card rounded-xl p-6">
      <Shimmer className="h-5 w-44 mb-5" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between items-center">
            <Shimmer className="h-4 w-12" />
            <Shimmer className="h-3 w-32" />
            <Shimmer className="h-4 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}
