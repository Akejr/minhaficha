import type {
  ApiFixture,
  ApiInjury,
} from "@/lib/api-football/types";

/**
 * Pre-match contextual adjustments applied AFTER strengths/form-derived λ.
 *
 *   - Injuries / suspensions: reduce attacking λ when "many" key forwards are
 *     out, increase defensive vulnerability when many defenders are out.
 *   - Rest days: short rest (≤3 days) penalises λ slightly; very long rest
 *     (>9 days) bumps it up a touch (sharper / less rusty).
 *
 * Each adjustment caps itself so context never dominates the model — at
 * most ±15% per axis.
 *
 * Output: a multiplier on (lambdaHome, lambdaAway) plus user-facing notes.
 */

export type ContextAdjustment = {
  homeLambdaFactor: number;
  awayLambdaFactor: number;
  notes: string[];
};

const INJURY_MULTIPLIER_PER_PLAYER = 0.025;
const INJURY_CAP = 0.15;
const REST_PENALTY_PER_DAY = 0.04;
const REST_PENALTY_CAP = 0.12;
const REST_BONUS_PER_DAY = 0.015;
const REST_BONUS_CAP = 0.06;

function lastFixtureBeforeMs(fixtures: ApiFixture[], cut: number): ApiFixture | null {
  const past = fixtures
    .filter(
      (f) =>
        f.fixture.status.short === "FT" &&
        f.fixture.timestamp * 1000 < cut,
    )
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);
  return past[0] ?? null;
}

function restDaysBefore(
  recentForTeam: ApiFixture[],
  matchTimestamp: number,
): number | null {
  const previous = lastFixtureBeforeMs(recentForTeam, matchTimestamp * 1000);
  if (!previous) return null;
  const diffMs = matchTimestamp * 1000 - previous.fixture.timestamp * 1000;
  return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Map an injury list into an attack/defence impact factor.
 *   - count "Missing Fixture" injuries only (questionable is too noisy).
 *   - cap at INJURY_CAP per side.
 * Returns multiplier on attacking λ for that team.
 */
function injuryImpact(injuries: ApiInjury[]): {
  attackFactor: number;
  vulnerabilityFactor: number;
  forwardCount: number;
  defenderCount: number;
} {
  const missing = injuries.filter((i) => i.player.type === "Missing Fixture");
  // We don't have positions in the API directly. Approximate: any injury
  // hurts the team. We split half between attack and defence so totals stay
  // bounded. This is intentionally conservative — without positional data
  // we can't be smarter without making things up.
  const half = missing.length / 2;
  const attackPenalty = Math.min(INJURY_CAP, half * INJURY_MULTIPLIER_PER_PLAYER);
  const defencePenalty = Math.min(INJURY_CAP, half * INJURY_MULTIPLIER_PER_PLAYER);
  return {
    attackFactor: 1 - attackPenalty,
    vulnerabilityFactor: 1 + defencePenalty, // their opponent will score MORE
    forwardCount: missing.length,
    defenderCount: missing.length,
  };
}

function restAdjustment(restDays: number | null): {
  factor: number;
  note?: string;
} {
  if (restDays == null) return { factor: 1 };
  if (restDays < 3) {
    const penalty = Math.min(
      REST_PENALTY_CAP,
      (3 - restDays) * REST_PENALTY_PER_DAY,
    );
    return {
      factor: 1 - penalty,
      note: `Vem de jogo há ${restDays.toFixed(1)} dias — possível desgaste físico.`,
    };
  }
  if (restDays > 9) {
    const bonus = Math.min(
      REST_BONUS_CAP,
      (restDays - 9) * REST_BONUS_PER_DAY,
    );
    return {
      factor: 1 + bonus,
      note: `Vem de ${restDays.toFixed(0)} dias sem jogar — pode estar mais descansado, mas também menos ritmado.`,
    };
  }
  return { factor: 1 };
}

export function computeContextAdjustment(args: {
  fixture: ApiFixture;
  homeRecent: ApiFixture[];
  awayRecent: ApiFixture[];
  homeInjuries: ApiInjury[];
  awayInjuries: ApiInjury[];
}): ContextAdjustment {
  const notes: string[] = [];

  const homeInj = injuryImpact(args.homeInjuries);
  const awayInj = injuryImpact(args.awayInjuries);

  if (homeInj.forwardCount > 0) {
    notes.push(
      `${args.fixture.teams.home.name} entra com ${homeInj.forwardCount} ` +
        `${homeInj.forwardCount === 1 ? "jogador" : "jogadores"} fora por lesão/suspensão.`,
    );
  }
  if (awayInj.forwardCount > 0) {
    notes.push(
      `${args.fixture.teams.away.name} entra com ${awayInj.forwardCount} ` +
        `${awayInj.forwardCount === 1 ? "jogador" : "jogadores"} fora por lesão/suspensão.`,
    );
  }

  const homeRest = restDaysBefore(args.homeRecent, args.fixture.fixture.timestamp);
  const awayRest = restDaysBefore(args.awayRecent, args.fixture.fixture.timestamp);
  const homeRestAdj = restAdjustment(homeRest);
  const awayRestAdj = restAdjustment(awayRest);
  if (homeRestAdj.note) notes.push(`${args.fixture.teams.home.name}: ${homeRestAdj.note}`);
  if (awayRestAdj.note) notes.push(`${args.fixture.teams.away.name}: ${awayRestAdj.note}`);

  // Combined factor on each team's λ:
  //   homeLambda × homeAttack(injuries) × awayDefence_vulnerability × homeRest
  //   awayLambda × awayAttack(injuries) × homeDefence_vulnerability × awayRest
  const homeLambdaFactor =
    homeInj.attackFactor * awayInj.vulnerabilityFactor * homeRestAdj.factor;
  const awayLambdaFactor =
    awayInj.attackFactor * homeInj.vulnerabilityFactor * awayRestAdj.factor;

  return { homeLambdaFactor, awayLambdaFactor, notes };
}
