import express from "express";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import * as z from "zod/v4";

const handler = createMcpHandler(({ requestInfo }) => {
  const server = new McpServer(
    { name: "typesafe-mcp-key", version: "1.0.2" },
    {
      instructions:
        "TypeSafe System One MCP bridge. Provide grounded state and typed Choice, Score, or Noul questions."
    }
  );

  server.registerTool(
    "system_one",
    {
      description: "Run TypeSafe System One using typed questions.",
      inputSchema: z.object({
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
      })
    },
    async ({ state, questions, model }) => {
      const apiKey =
        requestInfo?.headers.get("x-typesafe-api-key") ??
        requestInfo?.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
        process.env.TYPESAFE_API_KEY;

      if (!apiKey) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Missing TypeSafe API key. Send X-TypeSafe-API-Key or configure TYPESAFE_API_KEY."
            })
          }],
          isError: true
        };
      }

      const client = new TypeSafeClient({ apiKey, logLevel: "off" });
      const typedQuestions = {};

      for (const [id, q] of Object.entries(questions)) {
        if (q.type === "choice") {
          typedQuestions[id] = choice(q.instructions, q.criteria ?? {});
        } else if (q.type === "score") {
          typedQuestions[id] = score(q.instructions, q.levels ?? []);
        } else {
          typedQuestions[id] = noul(q.instructions);
        }
      }

      try {
        const result = await client.systemOne({
          state,
          questions: typedQuestions,
          ...(model ? { model } : {})
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error)
            })
          }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "health",
    {
      description: "Check the MCP bridge without revealing credentials.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          server: "typesafe-mcp-key",
          typesafeCredentialAvailable: Boolean(
            requestInfo?.headers.get("x-typesafe-api-key") ??
            requestInfo?.headers.get("authorization") ??
            process.env.TYPESAFE_API_KEY
          )
        })
      }]
    })
  );

  return server;
}, { responseMode: "json" });

const node = toNodeHandler(handler);
const app = express();
app.use(express.json({ limit: "4mb" }));
app.all("/mcp", (req, res) => void node(req, res, req.body));

export default app;
