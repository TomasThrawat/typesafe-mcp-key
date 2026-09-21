import express from "express";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/sdk/server";
import { toNodeHandler } from "@modelcontextprotocol/sdk/node";
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import * as z from "zod/v4";

const createServer = ({ requestInfo } = {}) => {
  const server = new McpServer(
    { name: "typesafe-mcp-key", version: "1.0.3" },
    { instructions: "TypeSafe System One MCP bridge. Provide grounded state and typed Choice, Score, or Noul questions." },
  );

  server.registerTool("system_one", {
    description: "Run TypeSafe System One using typed questions.",
    inputSchema: {
      state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
      questions: z.record(z.string(), z.object({
        type: z.enum(["choice", "score", "noul"]),
        instructions: z.string(),
        criteria: z.record(z.string(), z.unknown()).optional(),
        levels: z.array(z.string()).optional(),
      })),
      model: z.string().optional(),
    },
  }, async ({ state, questions, model }) => {
    const apiKey =
      requestInfo?.headers?.get("x-typesafe-api-key") ??
      requestInfo?.headers?.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
      process.env.TYPESAFE_API_KEY;
    if (!apiKey) return { content: [{ type: "text", text: JSON.stringify({ error: "Missing TypeSafe API key." }) }], isError: true };

    const client = new TypeSafeClient({ apiKey, logLevel: "off" });
    const typedQuestions = {};
    for (const [id, q] of Object.entries(questions)) {
      if (q.type === "choice") typedQuestions[id] = choice(q.instructions, q.criteria ?? {});
      else if (q.type === "score") typedQuestions[id] = score(q.instructions, q.levels ?? []);
      else typedQuestions[id] = noul(q.instructions);
    }
    try {
      const result = await client.systemOne({ state, questions: typedQuestions, ...(model ? { model } : {}) });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  });

  server.registerTool("health", {
    description: "Check the MCP bridge without revealing credentials.",
    inputSchema: z.object({}),
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify({
      ok: true, server: "typesafe-mcp-key",
      typesafeCredentialAvailable: Boolean(requestInfo?.headers?.get("x-typesafe-api-key") || requestInfo?.headers?.get("authorization") || process.env.TYPESAFE_API_KEY),
    }) }],
  }));

  return server;
};

const app = express();
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  res.set({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-typesafe-api-key,authorization",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/api/health", (_req, res) => res.status(200).json({
  ok: true, server: "typesafe-mcp-key", mobileApi: true,
  typesafeCredentialAvailable: Boolean(process.env.TYPESAFE_API_KEY),
}));

app.post("/api/ask", async (req, res) => {
  const apiKey = req.get("x-typesafe-api-key") || req.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || process.env.TYPESAFE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "TypeSafe server credential is not configured." });
  try {
    const input = z.object({
      state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
      questions: z.record(z.string(), z.object({
        type: z.enum(["choice", "score", "noul"]),
        instructions: z.string(),
        criteria: z.record(z.string(), z.unknown()).optional(),
        levels: z.array(z.string()).optional(),
      })),
      model: z.string().optional(),
    }).parse(req.body);

    const client = new TypeSafeClient({ apiKey, logLevel: "off" });
    const typedQuestions = {};
    for (const [id, q] of Object.entries(input.questions)) {
      if (q.type === "choice") typedQuestions[id] = choice(q.instructions, q.criteria ?? {});
      else if (q.type === "score") typedQuestions[id] = score(q.instructions, q.levels ?? []);
      else typedQuestions[id] = noul(q.instructions);
    }
    const result = await client.systemOne({
      state: input.state, questions: typedQuestions, ...(input.model ? { model: input.model } : {}),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const mcpHandler = createMcpHandler(createServer, { responseMode: "json" });
app.all("/mcp", (req, res) => void toNodeHandler(mcpHandler)(req, res, req.body));

export default app;
