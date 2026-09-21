import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import * as z from "zod/v4";

const handler = createMcpHandler(() => {
  const server = new McpServer(
    { name: "typesafe-mcp-key", version: "1.0.0" },
    {
      instructions:
        "Use this MCP to call TypeSafe System One for typed decisions and probabilities. " +
        "Keep questions narrow and grounded in supplied evidence."
    }
  );

  server.registerTool(
    "system_one",
    {
      description: "Run TypeSafe System One with a JSON/text state and typed questions.",
      inputSchema: z.object({
        state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
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
      })
    },
    async ({ state, questions, model }) => {
      const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY });
      const typedQuestions: Record<string, any> = {};

      for (const [id, q] of Object.entries(questions)) {
        if (q.type === "choice") {
          typedQuestions[id] = choice(q.instructions, q.criteria ?? {});
        } else if (q.type === "score") {
          typedQuestions[id] = score(q.instructions, q.levels ?? []);
        } else {
          typedQuestions[id] = noul(q.instructions);
        }
      }

      const result = await client.systemOne({
        state,
        questions: typedQuestions,
        ...(model ? { model } : {})
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    }
  );

  server.registerTool(
    "health",
    {
      description: "Check that the MCP server is running and TypeSafe credentials are configured.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          typesafeConfigured: Boolean(process.env.TYPESAFE_API_KEY)
        })
      }]
    })
  );

  return server;
}, { responseMode: "json" });

export default async function mcp(request: Request) {
  if (new URL(request.url).pathname !== "/api/mcp") {
    return new Response("Not Found", { status: 404 });
  }
  return handler.fetch(request);
}
