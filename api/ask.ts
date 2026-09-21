import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import * as z from "zod/v4";

const inputSchema = z.object({
  state: z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

export default async function ask(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type"
      }
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return json({ error: "TypeSafe server credential is not configured." }, 500);
  }

  try {
    const body = inputSchema.parse(await request.json());
    const client = new TypeSafeClient({ apiKey, logLevel: "off" });
    const typedQuestions: Record<string, unknown> = {};

    for (const [id, question] of Object.entries(body.questions)) {
      if (question.type === "choice") {
        typedQuestions[id] = choice(
          question.instructions,
          question.criteria ?? {}
        );
      } else if (question.type === "score") {
        typedQuestions[id] = score(
          question.instructions,
          question.levels ?? []
        );
      } else {
        typedQuestions[id] = noul(question.instructions);
      }
    }

    const result = await client.systemOne({
      state: body.state,
      questions: typedQuestions,
      ...(body.model ? { model: body.model } : {})
    });

    return json(result);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      400
    );
  }
}
