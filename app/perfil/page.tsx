import { redirect } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { ProfileView } from "@/components/profile/ProfileView";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/supabase/session";
import { FREE_DAILY_LIMIT } from "@/lib/plans";

export default async function ProfilePage() {
  const { user, profile, plan } = await getCurrentSession();
  if (!user) redirect("/entrar?returnTo=/perfil");

  // Today's usage for the free counter — only fetched when relevant.
  let usedToday = 0;
  if (plan === "free") {
    const supabase = createServerClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("daily_usage")
      .select("analyses_count")
      .eq("user_id", user.id)
      .eq("day", today)
      .maybeSingle();
    usedToday = usage?.analyses_count ?? 0;
  }

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in">
        <ProfileView
          email={user.email ?? ""}
          profile={profile}
          usedToday={usedToday}
          dailyLimit={FREE_DAILY_LIMIT}
        />
      </main>

      <BottomNavBar />
    </>
  );
}

// This page reads cookies (auth session), so it must be rendered per-request.
export const dynamic = "force-dynamic";
