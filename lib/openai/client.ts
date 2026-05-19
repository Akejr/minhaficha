/**
 * Thin wrapper around the OpenAI Responses API.
 *
 * We call the Responses endpoint (not Chat Completions) because gpt-5.x
 * exposes its reasoning capabilities best through that interface. The model
 * is configurable via OPENAI_MODEL so the deployment can swap between
 * gpt-5.4-mini, gpt-5.4, or any future variant without code changes.
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

function getKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new OpenAIError(
      "OPENAI_API_KEY missing. Add it to .env.local.",
    );
  }
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5.4-mini";
}

export type ResponsesRequest = {
  /** System-level instructions. */
  instructions: string;
  /** User message body. */
  input: string;
  /**
   * Optional JSON Schema to force structured output. When provided we use
   * `response_format: { type: "json_schema", ... }` so the SDK guarantees
   * the model returns valid JSON matching the schema.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Sampling temperature; default 0.4 for analytical tasks. */
  temperature?: number;
  /** Max output tokens. */
  maxOutputTokens?: number;
};

export type ResponsesResult = {
  text: string;
  /** Parsed JSON when `jsonSchema` was supplied. */
  json: unknown | null;
  model: string;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null;
};

/**
 * Call the Responses API and return the text + parsed JSON (when applicable).
 * Throws OpenAIError on any non-2xx or malformed response.
 */
export async function callResponses(req: ResponsesRequest): Promise<ResponsesResult> {
  const model = getModel();

  const body: Record<string, unknown> = {
    model,
    instructions: req.instructions,
    input: req.input,
    max_output_tokens: req.maxOutputTokens ?? 1500,
  };

  // gpt-5.x reasoning models don't accept a custom temperature; only attach
  // when the caller really wants one and the model is on a non-reasoning line.
  if (req.temperature != null && !model.startsWith("gpt-5")) {
    body.temperature = req.temperature;
  }

  if (req.jsonSchema) {
    // Responses API uses `text.format`, not Chat Completions' `response_format`.
    body.text = {
      format: {
        type: "json_schema",
        name: req.jsonSchema.name,
        schema: req.jsonSchema.schema,
        strict: true,
      },
    };
  }

  const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new OpenAIError(
      `OpenAI HTTP ${res.status} (${model})`,
      res.status,
      raw,
    );
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new OpenAIError("OpenAI returned non-JSON response", res.status, raw);
  }

  // Responses API: extract text from `output[].content[].text`.
  const text = extractOutputText(json);

  let parsedJson: unknown | null = null;
  if (req.jsonSchema && text) {
    try {
      parsedJson = JSON.parse(text);
    } catch (err) {
      throw new OpenAIError(
        `Model returned text that isn't valid JSON for schema "${req.jsonSchema.name}"`,
        res.status,
        text,
      );
    }
  }

  return {
    text,
    json: parsedJson,
    model,
    usage: json.usage ?? null,
  };
}

/**
 * Walk the Responses API output array and concatenate every text chunk.
 * Robust to the model returning tool calls or refusals — we just take the
 * text content. Refusals are surfaced as plain text (caller decides what to do).
 */
function extractOutputText(payload: any): string {
  // Newer SDK exposes a convenience field.
  if (typeof payload?.output_text === "string") return payload.output_text;

  const out = payload?.output;
  if (!Array.isArray(out)) return "";

  const chunks: string[] = [];
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") {
          chunks.push(c.text);
        }
      }
    }
  }
  return chunks.join("\n").trim();
}
