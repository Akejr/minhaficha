import type { AnalysisPayload } from "@/lib/betting";
import { callResponses } from "./client";

/**
 * Ask the model to read the deterministic analysis payload and pick THREE
 * bets (low / medium / high risk) plus a short narrative summary.
 *
 * Important: the model is told it MUST select bets only from the `markets`
 * list we computed — it cannot invent new markets or change probabilities.
 * The IA also speaks in plain Brazilian Portuguese (pt-BR) without math
 * jargon — the prompt carries an explicit glossary banning European
 * Portuguese vocabulary ("golos", "equipa", "cantos", ...).
 */

export type RiskLevel = "low" | "medium" | "high";

export type SelectedBet = {
  riskLevel: RiskLevel;
  marketKey: string;
  marketLabel: string;
  probability: number;
  rationale: string;
};

export type AnalysisOutput = {
  summary: string;
  confidence: number;
  bets: SelectedBet[];
};

const INSTRUCTIONS = `Você é um analista de futebol do app "ApostAI".

Você recebe um JSON com:
- dados do jogo (times, liga, etc.)
- features estatísticas internas
- "narrative" com observações já em português sobre o contexto do jogo, forma de cada time e histórico de confrontos
- "history" com números resumidos da temporada e dos últimos jogos
- "suggestableMarkets" — lista de mercados ELEGÍVEIS para recomendação. Já filtrada para excluir mercados "óbvios demais" (probabilidade alta demais com retorno irrelevante) e "palpites soltos" (probabilidade baixa demais).

Sua tarefa: ESCOLHER 3 apostas da lista \`suggestableMarkets\` (uma de cada nível de risco) e escrever:
- um resumo curto do jogo
- uma justificativa para cada aposta

Tudo em PORTUGUÊS DO BRASIL, em LINGUAGEM SIMPLES E ACESSÍVEL — como você explicaria para um amigo na mesa do bar.

GLOSSÁRIO OBRIGATÓRIO (use sempre estas palavras, nunca as variantes de Portugal):
- "gols" (nunca "golos")
- "escanteios" (nunca "cantos" nem "pontapés de canto")
- "time" (nunca "equipa")
- "temporada" (nunca "época")
- "primeiro tempo" / "segundo tempo" (nunca "1ª parte" / "2ª parte")
- "goleiro" (nunca "guarda-redes")
- "zagueiro" / "lateral" (nunca "defesa" nem "central")
- "atacante" (nunca "avançado" nem "ponta-de-lança")
- "meio-campista" ou "volante" (nunca "médio")
- "marcar" / "fazer gol" (nunca "fazer golo")
- "casa / fora" (mantém)
- "jogo" / "partida" / "confronto" (todas válidas, evite "encontro")
- "rodada" (nunca "jornada")
- "tabela" / "classificação" (ambas válidas)
- Use "você", nunca "tu". Conjugue no imperativo brasileiro ("veja", "repare"), nunca "vê", "repara".

REGRAS DE LINGUAGEM (CRÍTICAS):
- NUNCA use jargão matemático ou estatístico: NUNCA mencione "λ", "lambda", "Poisson", "Dixon-Coles", "modelo", "probabilidade calculada", "esperança", "regressão", "média ponderada".
- NUNCA use ortografia ou construções de Portugal ("facto", "óptimo", "connosco", "a jogar" no sentido de gerúndio). Escreva gerúndio brasileiro ("jogando", "vencendo").
- NUNCA cite valores numéricos brutos do JSON (NUNCA escreva "λ de 1.65" ou "probabilidade 73.4%" no texto). Pode dizer "alta probabilidade", "claro favorito", "praticamente moeda ao ar", etc.
- NUNCA mencione odds, fair odds, casas de apostas, retorno financeiro, valor da aposta. Não somos uma casa de apostas.
- Use frases curtas. Cite times, jogadores, momento, resultados dos jogos recentes (esses VOCÊ pode usar — vêm da narrative/history).
- Tom: confiante mas humilde. Você está analisando, não garantindo.

REGRAS DURAS DE SELEÇÃO DE APOSTAS:
1. Use APENAS mercados que estão na lista \`suggestableMarkets\`. Use o \`marketKey\` exato.
2. Critério estrito de risco baseado na probabilidade do mercado:
   - "low":   probabilidade entre 65% e 78% (zona de aposta segura, com algum retorno).
   - "medium": probabilidade entre 38% e 58%. Equilibrada.
   - "high":  probabilidade entre 18% e 32%. Arriscada, mas plausível.
3. As 3 apostas devem ser de MERCADOS DIFERENTES. Não escolha "Casa ganha" e "Casa ou empate" juntas, nem "Mais de 1.5 gols" e "Mais de 2.5 gols" juntas. Os tipos de mercado precisam ser distintos.
4. **Se nenhum mercado da lista couber claramente na faixa de algum nível, pode SUPRIMIR esse nível** retornando apenas 2 apostas. É preferível dar menos sugestões honestas do que forçar uma aposta fraca. Ex: se em \`suggestableMarkets\` não há nenhum mercado entre 65-78%, retorne apenas 2 apostas (médio + alto).
5. Cada justificativa: 2 a 4 frases. Cite fatos concretos da \`narrative\` e da \`history\` (forma recente, vitórias/derrotas, gols, confrontos diretos).
6. O resumo geral: 2 a 4 frases descrevendo o jogo, o seu favorito, fator-chave. Não fale das apostas no resumo.
7. Responda APENAS o JSON do schema, sem texto adicional.`;

const JSON_SCHEMA = {
  name: "apostai_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description: "Resumo do jogo em 2-4 frases, em pt-BR, linguagem simples.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
      bets: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["riskLevel", "marketKey", "rationale"],
          properties: {
            riskLevel: { type: "string", enum: ["low", "medium", "high"] },
            marketKey: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
    },
    required: ["summary", "confidence", "bets"],
  },
} as const;

/**
 * Markets we strip from the IA payload entirely:
 *
 *   - probability ≥ 80% → "free money" outcomes that pay too little to be
 *     worth recommending (e.g. a 95% home-or-draw at odd 1.04). The user
 *     gets no value from these.
 *   - probability ≤ 8%  → essentially noise; not analytical picks.
 *
 * The math is unaffected — these markets still exist server-side, we just
 * don't surface them as IA recommendations.
 */
const SUGGESTABLE_MIN_PROB = 0.08;
const SUGGESTABLE_MAX_PROB = 0.80;

function compactPayload(payload: AnalysisPayload) {
  // Only show the IA the markets that are eligible to become a recommendation.
  // We still pass the full set in `allMarkets` for context, but the model is
  // only allowed to pick from `suggestableMarkets`.
  const suggestable = payload.markets.filter(
    (m) =>
      m.probability >= SUGGESTABLE_MIN_PROB &&
      m.probability <= SUGGESTABLE_MAX_PROB,
  );
  return {
    fixture: payload.fixture,
    teams: payload.teams,
    narrative: payload.narrative,
    history: payload.history,
    features: payload.features,
    suggestableMarkets: suggestable,
  };
}

/**
 * Run the IA analysis. Probability comes from our model, NOT the IA.
 */
export async function analyzeWithAI(
  payload: AnalysisPayload,
): Promise<AnalysisOutput> {
  const compact = compactPayload(payload);

  const result = await callResponses({
    instructions: INSTRUCTIONS,
    input: JSON.stringify(compact),
    jsonSchema: { name: JSON_SCHEMA.name, schema: JSON_SCHEMA.schema },
    temperature: 0.4,
    maxOutputTokens: 1500,
  });

  if (!result.json) {
    throw new Error("IA não retornou JSON estruturado.");
  }

  const parsed = result.json as {
    summary: string;
    confidence: number;
    bets: { riskLevel: RiskLevel; marketKey: string; rationale: string }[];
  };

  // Defence in depth: re-resolve probability from our payload using marketKey.
  const marketByKey = new Map(payload.markets.map((m) => [m.key, m]));
  const reconciled: SelectedBet[] = parsed.bets.map((b) => {
    const truth = marketByKey.get(b.marketKey);
    if (!truth) {
      throw new Error(`IA escolheu mercado inexistente: ${b.marketKey}.`);
    }
    return {
      riskLevel: b.riskLevel,
      marketKey: truth.key,
      marketLabel: truth.label,
      probability: truth.probability,
      rationale: b.rationale,
    };
  });

  return {
    summary: parsed.summary,
    confidence: parsed.confidence,
    bets: reconciled,
  };
}
