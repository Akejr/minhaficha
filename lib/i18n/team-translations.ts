/**
 * Mapping of Portuguese / common-Latin team and country names to the
 * English variants stored in API-Football. The API mostly indexes teams in
 * English, so a Portuguese-speaking user typing "Marrocos" or "Inglaterra"
 * gets zero hits unless we translate before querying.
 *
 * The map is intentionally small: only the 50-or-so high-volume queries
 * we expect. For everything else we still query the original term.
 */

const TRANSLATIONS: Record<string, string> = {
  // Countries / national teams
  alemanha: "germany",
  argentina: "argentina",
  arabia: "saudi arabia",
  arábia: "saudi arabia",
  "arábia saudita": "saudi arabia",
  "arabia saudita": "saudi arabia",
  austrália: "australia",
  australia: "australia",
  belgica: "belgium",
  bélgica: "belgium",
  brasil: "brazil",
  camarões: "cameroon",
  canada: "canada",
  canadá: "canada",
  chile: "chile",
  china: "china",
  colombia: "colombia",
  colômbia: "colombia",
  coreia: "korea",
  croácia: "croatia",
  croacia: "croatia",
  dinamarca: "denmark",
  egito: "egypt",
  egipto: "egypt",
  equador: "ecuador",
  escócia: "scotland",
  escocia: "scotland",
  espanha: "spain",
  estados: "united states",
  eua: "united states",
  finlândia: "finland",
  finlandia: "finland",
  frança: "france",
  franca: "france",
  gales: "wales",
  grécia: "greece",
  grecia: "greece",
  holanda: "netherlands",
  hungria: "hungary",
  inglaterra: "england",
  irlanda: "ireland",
  israel: "israel",
  itália: "italy",
  italia: "italy",
  japão: "japan",
  japao: "japan",
  marrocos: "morocco",
  méxico: "mexico",
  mexico: "mexico",
  nigeria: "nigeria",
  nigéria: "nigeria",
  noruega: "norway",
  paraguai: "paraguay",
  peru: "peru",
  polónia: "poland",
  polonia: "poland",
  portugal: "portugal",
  romênia: "romania",
  romenia: "romania",
  rússia: "russia",
  russia: "russia",
  senegal: "senegal",
  servia: "serbia",
  sérvia: "serbia",
  suécia: "sweden",
  suecia: "sweden",
  suíça: "switzerland",
  suiça: "switzerland",
  suica: "switzerland",
  turquia: "turkey",
  uruguai: "uruguay",
  venezuela: "venezuela",

  // Common team aliases
  bayern: "bayern munich",
  juve: "juventus",
  juventude: "juventude",
  manu: "manchester united",
  city: "manchester city",
  united: "manchester united",
  psg: "paris saint germain",
  paris: "paris saint germain",
  real: "real madrid",
  barça: "barcelona",
  barca: "barcelona",
  atleti: "atletico madrid",
  flamengo: "flamengo",
  fla: "flamengo",
  flu: "fluminense",
  galo: "atletico mineiro",
  inter: "internazionale",
  internacional: "internacional",
  benfica: "benfica",
  porto: "porto",
  sporting: "sporting cp",
  spurs: "tottenham",
  arsenal: "arsenal",
};

/**
 * Try to find an English translation for the given Portuguese-ish query.
 * Returns null when no translation is known — caller should fall back to
 * the original term.
 *
 *   translateForSearch("brasil")          → "brazil"
 *   translateForSearch("Marrocos")        → "morocco"
 *   translateForSearch("arabia saudita")  → "saudi"
 *   translateForSearch("Real Madrid")     → null  (no whole-string entry)
 */
export function translateForSearch(query: string): string | null {
  if (!query) return null;
  const normalised = query.trim().toLowerCase();

  // 1. Exact whole-string match.
  if (TRANSLATIONS[normalised]) return TRANSLATIONS[normalised];

  // 2. Two-word phrase that has a "leading word" mapping. We translate the
  //    first word ONLY when none of the following words contains a known
  //    English football term — to avoid double-translating things like
  //    "Real Madrid" or "FC Porto".
  const words = normalised.split(/\s+/);
  if (words.length === 1) return null;

  const leading = TRANSLATIONS[words[0]];
  if (!leading) return null;

  // If any tail word looks English-y (matches a value somewhere in the map
  // or contains chars typically not present in PT short words), bail.
  const tail = words.slice(1).join(" ");
  if (looksAlreadyTranslated(tail)) return null;

  // Otherwise, replace just the first word.
  return `${leading} ${tail}`.trim();
}

/**
 * Heuristic: tail looks English if it contains "fc", "city", "united",
 * "madrid", "munich", etc. These are common cluster words for clubs.
 */
const ENGLISH_HINTS = new Set([
  "fc",
  "cf",
  "ac",
  "city",
  "united",
  "madrid",
  "munich",
  "saint",
  "germain",
  "rovers",
  "wanderers",
  "town",
  "athletic",
  "athletico",
  "real",
]);

function looksAlreadyTranslated(text: string): boolean {
  const tokens = text.split(/\s+/);
  for (const t of tokens) if (ENGLISH_HINTS.has(t)) return true;
  return false;
}
