import type { Plan, Profile } from "@/lib/supabase/types";

export type PlanInfo = {
  id: Plan;
  name: string;
  pricePerCycleKz: number;
  cycleLabel: string;
  pricePerCycleLabel: string;
  perks: string[];
  cta: string;
};

export const PLANS: Record<Plan, PlanInfo> = {
  free: {
    id: "free",
    name: "Grátis",
    pricePerCycleKz: 0,
    cycleLabel: "para sempre",
    pricePerCycleLabel: "0 Kz",
    perks: [
      "2 análises por dia",
      "Apenas a sugestão de médio risco visível",
      "Resto desbloqueia com o plano pago",
    ],
    cta: "Plano atual",
  },
  weekly: {
    id: "weekly",
    name: "Semanal",
    pricePerCycleKz: 1500,
    cycleLabel: "por 7 dias",
    pricePerCycleLabel: "1.500 Kz",
    perks: [
      "Análises ilimitadas",
      "As 3 sugestões (baixo, médio e alto risco)",
      "Histórico completo",
    ],
    cta: "Escolher semanal",
  },
  monthly: {
    id: "monthly",
    name: "Mensal",
    pricePerCycleKz: 5000,
    cycleLabel: "por 30 dias",
    pricePerCycleLabel: "5.000 Kz",
    perks: [
      "Análises ilimitadas",
      "As 3 sugestões (baixo, médio e alto risco)",
      "Histórico completo",
      "Suporte prioritário",
    ],
    cta: "Escolher mensal",
  },
};

export const FREE_DAILY_LIMIT = 2;

/** Convenience: is the user on a paid plan and not expired? */
export function isPaid(profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.plan === "free") return false;
  if (!profile.plan_expires_at) return false;
  return new Date(profile.plan_expires_at).getTime() > Date.now();
}

/** Effective plan, accounting for expiration. */
export function effectivePlan(profile: Profile | null): Plan {
  if (!profile) return "free";
  if (isPaid(profile)) return profile.plan;
  return "free";
}
