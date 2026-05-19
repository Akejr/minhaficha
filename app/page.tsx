import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { HeroSearch } from "@/components/HeroSearch";
import { PopularMatchesSection } from "@/components/PopularMatchesSection";

export default async function HomePage() {
  return (
    <>
      {/* Ambient neon lights */}
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 min-h-screen flex flex-col justify-start bg-grid-pattern anim-page-in">
        <HeroSearch />
        <PopularMatchesSection />
      </main>

      <BottomNavBar />
    </>
  );
}


// Re-evaluates the popular fixtures on every visit so a kickoff that just
// happened gets swapped out within minutes (rather than being held by the
// 30-min cache that App Router static rendering would impose).
export const revalidate = 60;
