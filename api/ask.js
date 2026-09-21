import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import * as z from "zod/v4";

const inputSchema = z.object({
  state: z.union([
    z.string(),
    z.record(z.string(), z.string()),
    z.array(z.unknown())
  ]),
  questions: z.record(
    z.string(),
    z.object({
      type: z.enum(["choice", "score", "noul"]),
      instructions: z.string(),
      criteria: z.record(z.string(), z.unknown()).optional(),
      levels: z.array(z.string()).optional()
    })
  ),
  model: z.string().optional()
});

function sendJson(res, data, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-TypeSafe-API-Key, Authorization");
  return res.json(data);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

export default async function ask(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-TypeSafe-API-Key, Authorization");
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, { error: "Method Not Allowed" }, 405);
  }

  const apiKey =
    req.headers["x-typesafe-api-key"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() ||
    process.env.TYPESAFE_API_KEY;

  if (!apiKey) {
    return sendJson(res, { error: "TypeSafe server credential is not configured." }, 500);
  }

  try {
    const input = inputSchema.parse(await readJson(req));
    const client = new TypeSafeClient({ apiKey, logLevel: "off" });
    const typedQuestions = {};

    for (const [id, question] of Object.entries(input.questions)) {
      if (question.type === "choice") {
        typedQuestions[id] = choice(question.instructions, question.criteria ?? {});
      } else if (question.type === "score") {
        typedQuestions[id] = score(question.instructions, question.levels ?? []);
      } else {
        typedQuestions[id] = noul(question.instructions);
      }
    }

    const result = await client.systemOne({
      state: input.state,
      questions: typedQuestions,
      ...(input.model ? { model: input.model } : {})
    });

    return sendJson(res, result, 200);
  } catch (error) {
    return sendJson(res, {
      error: error instanceof Error ? error.message : String(error)
    }, 400);
  }
}
