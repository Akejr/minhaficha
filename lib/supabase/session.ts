import { cache } from "react";
import { createServerClient } from "./server";
import type { Profile } from "./types";
import { effectivePlan, type PlanInfo } from "@/lib/plans";
import { PLANS } from "@/lib/plans";

/**
 * Per-request memoised auth helpers.
 *
 * `React.cache` deduplicates calls inside a single request: any number of
 * Server Components calling `getCurrentUser()` during the same render gets
 * the same Promise (no extra round-trips to Supabase).
 *
 * We expose three helpers:
 *
 *   - getCurrentUser()    : just the auth user (or null if logged out)
 *   - getCurrentProfile() : profile row, fetched once per request
 *   - getCurrentSession() : { user, profile, plan, planInfo } bundle for
 *                           pages and the TopAppBar
 *
 * Use the lightest helper that gets the job done.
 */

export const getCurrentUser = cache(async () => {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    return (data as Profile | null) ?? null;
  } catch {
    return null;
  }
});

export type SessionBundle = {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  profile: Profile | null;
  plan: ReturnType<typeof effectivePlan>;
  planInfo: PlanInfo;
};

export const getCurrentSession = cache(async (): Promise<SessionBundle> => {
  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);
  const plan = effectivePlan(profile);
  return {
    user,
    profile,
    plan,
    planInfo: PLANS[plan],
  };
});
