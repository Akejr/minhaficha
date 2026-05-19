import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";

export default function ProfileLoading() {
  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in">
        <div className="flex flex-col gap-6">
          <section className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-white/[0.06]" />
              <div className="flex-1">
                <Shimmer className="h-5 w-32 mb-1.5" />
                <Shimmer className="h-3 w-44" />
              </div>
            </div>
            <Shimmer className="h-10 w-full rounded-xl" />
          </section>
          <section className="glass-card rounded-2xl p-6">
            <Shimmer className="h-5 w-32 mb-3" />
            <Shimmer className="h-4 w-full" />
          </section>
          <section>
            <Shimmer className="h-5 w-36 mb-3" />
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Shimmer key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          </section>
        </div>
      </main>

      <BottomNavBar />
    </>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.08] bg-[length:400%_100%] animate-shimmer rounded ${className}`}
    />
  );
}
