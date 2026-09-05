/**
 * Mapping of Brazilian-Portuguese team and country names to the variants
 * stored in API-Football. The API mostly indexes countries in English and
 * clubs under their formal names, so a Brazilian user typing "Marrocos",
 * "Inglaterra" or "timão" gets zero hits unless we translate first.
 *
 * Two groups live here:
 *   - country / national-team names (pt → en)
 *   - club nicknames and short forms (mostly Brazilian, plus the European
 *     clubs with a big following in Brazil)
 *
 * For anything not listed we still query the original term.
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

  // Brazilian clubs — nicknames and short forms our users actually type.
  // API-Football indexes these under their formal names, so the mapping
  // turns "timão" into a query that actually returns something.
  flamengo: "flamengo",
  fla: "flamengo",
  mengao: "flamengo",
  mengão: "flamengo",
  palmeiras: "palmeiras",
  verdao: "palmeiras",
  verdão: "palmeiras",
  porco: "palmeiras",
  corinthians: "corinthians",
  timao: "corinthians",
  timão: "corinthians",
  coringao: "corinthians",
  coringão: "corinthians",
  "sao paulo": "sao paulo",
  "são paulo": "sao paulo",
  spfc: "sao paulo",
  santos: "santos",
  peixe: "santos",
  fluminense: "fluminense",
  flu: "fluminense",
  vasco: "vasco da gama",
  vascao: "vasco da gama",
  vascão: "vasco da gama",
  botafogo: "botafogo",
  fogao: "botafogo",
  fogão: "botafogo",
  gremio: "gremio",
  grêmio: "gremio",
  imortal: "gremio",
  internacional: "internacional",
  colorado: "internacional",
  cruzeiro: "cruzeiro",
  raposa: "cruzeiro",
  galo: "atletico mineiro",
  atletico: "atletico mineiro",
  atlético: "atletico mineiro",
  athletico: "athletico paranaense",
  furacao: "athletico paranaense",
  furacão: "athletico paranaense",
  bahia: "bahia",
  tricolor: "bahia",
  vitoria: "vitoria",
  vitória: "vitoria",
  fortaleza: "fortaleza",
  ceara: "ceara",
  ceará: "ceara",
  sport: "sport recife",
  nautico: "nautico",
  náutico: "nautico",
  goias: "goias",
  goiás: "goias",
  atleticogo: "atletico goianiense",
  coritiba: "coritiba",
  chapecoense: "chapecoense",
  juventude: "juventude",
  bragantino: "red bull bragantino",
  "red bull": "red bull bragantino",
  cuiaba: "cuiaba",
  cuiabá: "cuiaba",
  mirassol: "mirassol",
  santa: "santa cruz",

  // European clubs
  bayern: "bayern munich",
  juve: "juventus",
  manu: "manchester united",
  city: "manchester city",
  united: "manchester united",
  psg: "paris saint germain",
  paris: "paris saint germain",
  real: "real madrid",
  barça: "barcelona",
  barca: "barcelona",
  atleti: "atletico madrid",
  inter: "internazionale",
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
