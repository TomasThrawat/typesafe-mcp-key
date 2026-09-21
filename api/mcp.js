import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";

const FREE_TEXT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const FREE_VISION_MODEL = "inclusionai/ling-3.0-flash-vl:free";

function apiKeyFromRequest(requestInfo) {
  const fromHeader = requestInfo?.headers?.get("x-openrouter-api-key");
  const authorization = requestInfo?.headers?.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();

  return (
    fromHeader ||
    bearer ||
    process.env.OPENROUTER_API_KEY ||
    ""
  ).trim();
}

async function callOpenRouter(apiKey, model, messages) {
  if (!apiKey) {
    throw new Error(
      "Missing OpenRouter API key. Configure OPENROUTER_API_KEY on Vercel or send it as the MCP Authorization bearer token."
    );
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://typesafe-mcp-key-hyouka1.vercel.app",
        "X-Title": "TypeSafe Kotlin App MCP"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.25,
        max_tokens: 4096
      })
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "OpenRouter HTTP " + response.status
    );
  }

  const answer = payload?.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("OpenRouter returned no assistant text.");
  }

  return answer.trim();
}

function createServer({ requestInfo }) {
  const apiKey = apiKeyFromRequest(requestInfo);

  const server = new McpServer(
    {
      name: "typesafe-kotlin-app",
      version: "2.0.1"
    },
    {
      instructions:
        "Use chat for natural-language AI answers, send-photo for image analysis, and send-file for text-file analysis. Free OpenRouter models are used."
    }
  );

  server.registerTool(
    "health",
    {
      description: "Check whether the TypeSafe Kotlin AI MCP server is alive.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: true,
            server: "typesafe-kotlin-app",
            mcp: true,
            openRouterKeyConfigured: Boolean(apiKey)
          })
        }
      ]
    })
  );

  server.registerTool(
    "chat",
    {
      description:
        "Get a normal natural-language AI response using a free coding model.",
      inputSchema: z.object({
        message: z.string().min(1).max(12000)
      })
    },
    async ({ message }) => {
      try {
        const answer = await callOpenRouter(apiKey, FREE_TEXT_MODEL, [
          { role: "user", content: message }
        ]);

        return {
          content: [{ type: "text", text: answer }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error)
            }
          ],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "send-photo",
    {
      description:
        "Send a photo as a data URL to the free vision model for analysis.",
      inputSchema: z.object({
        prompt: z.string().max(12000).optional(),
        imageDataUrl: z
          .string()
          .startsWith("data:image/")
          .max(4_000_000)
      })
    },
    async ({ prompt, imageDataUrl }) => {
      try {
        const answer = await callOpenRouter(apiKey, FREE_VISION_MODEL, [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt || "Analyze this image."
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl }
              }
            ]
          }
        ]);

        return {
          content: [{ type: "text", text: answer }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error)
            }
          ],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "send-file",
    {
      description:
        "Send a text-based file to the free coding AI for analysis.",
      inputSchema: z.object({
        filename: z.string().min(1).max(180),
        mimeType: z.string().max(120).optional(),
        content: z.string().min(1).max(1_000_000),
        prompt: z.string().max(12000).optional()
      })
    },
    async ({ filename, mimeType, content, prompt }) => {
      try {
        const answer = await callOpenRouter(apiKey, FREE_TEXT_MODEL, [
          {
            role: "user",
            content:
              (prompt || "Analyze this attached file and help me with it.") +
              "\n\n[File: " +
              filename +
              " | " +
              (mimeType || "text/plain") +
              "]\n" +
              content
          }
        ]);

        return {
          content: [{ type: "text", text: answer }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error)
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}

const handler = createMcpHandler(createServer, { responseMode: "json" });
const nodeHandler = toNodeHandler(handler);

export default function mcp(req, res) {
  return nodeHandler(req, res);
}
