import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { ProfileView } from "@/components/profile/ProfileView";
import { getCurrentAccess } from "@/lib/access/session";

/**
 * Profile / subscription page.
 *
 * Reachable without a code on purpose: for a visitor who hasn't bought yet
 * this IS the sales page, and the paywall links here.
 */
export default async function ProfilePage() {
  const access = await getCurrentAccess();

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in">
        <ProfileView
          access={
            access
              ? {
                  code: access.code,
                  isPermanent: access.isPermanent,
                  expiresAt: access.expiresAt?.toISOString() ?? null,
                  daysLeft: Number.isFinite(access.daysLeft)
                    ? access.daysLeft
                    : null,
                }
              : null
          }
        />
      </main>

      <BottomNavBar />
    </>
  );
}

// Reads the access cookie, so it must be rendered per-request.
export const dynamic = "force-dynamic";
