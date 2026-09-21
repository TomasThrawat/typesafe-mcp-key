const FREE_TEXT_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "poolside/laguna-s-2.1:free",
  "inclusionai/ling-3.0-flash-vl:free"
];

const FREE_VISION_MODEL = "inclusionai/ling-3.0-flash-vl:free";

function setCors(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-OpenRouter-API-Key, Authorization"
  );
}

function send(res, status, body) {
  setCors(res);
  res.status(status).json(body);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function pickApiKey(req) {
  const headerKey =
    req.headers["x-openrouter-api-key"] ||
    req.headers["X-OpenRouter-API-Key"] ||
    "";

  const authorization =
    req.headers.authorization ||
    req.headers.Authorization ||
    "";

  const bearerKey = String(authorization)
    .replace(/^Bearer\s+/i, "")
    .trim();

  return (
    String(headerKey).trim() ||
    bearerKey ||
    String(process.env.OPENROUTER_API_KEY || "").trim()
  );
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role,
      content:
        typeof m.content === "string"
          ? m.content.slice(0, 12000)
          : String(m.content || "")
    }))
    .slice(-24);
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a.name === "string")
    .slice(0, 4)
    .map((a) => ({
      name: a.name.slice(0, 180),
      mimeType:
        typeof a.mimeType === "string"
          ? a.mimeType.slice(0, 120)
          : "application/octet-stream",
      sizeBytes: Number.isFinite(a.sizeBytes) ? a.sizeBytes : 0,
      textContent:
        typeof a.textContent === "string"
          ? a.textContent.slice(0, 1_000_000)
          : null,
      imageDataUrl:
        typeof a.imageDataUrl === "string" &&
        a.imageDataUrl.startsWith("data:image/")
          ? a.imageDataUrl.slice(0, 4_000_000)
          : null
    }));
}

function buildMessages(messages, attachments) {
  const result = [...messages];

  const textAttachments = attachments.filter((a) => a.textContent);
  const images = attachments.filter((a) => a.imageDataUrl);

  const attachmentText = textAttachments
    .map(
      (a) =>
        "\\n\\n[Attached file: " +
        a.name +
        " | " +
        a.mimeType +
        "]\\n" +
        a.textContent
    )
    .join("");

  if (attachmentText) {
    let lastUserIndex = -1;
    for (let i = result.length - 1; i >= 0; i -= 1) {
      if (result[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex >= 0) {
      result[lastUserIndex] = {
        role: "user",
        content: result[lastUserIndex].content + attachmentText
      };
    }
  }

  if (images.length) {
    let lastUserIndex = -1;
    for (let i = result.length - 1; i >= 0; i -= 1) {
      if (result[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex < 0) {
      result.push({
        role: "user",
        content: "Analyze the attached image."
      });
      lastUserIndex = result.length - 1;
    }

    const text =
      typeof result[lastUserIndex].content === "string"
        ? result[lastUserIndex].content
        : "Analyze the attached image.";

    result[lastUserIndex] = {
      role: "user",
      content: [
        { type: "text", text },
        ...images.map((a) => ({
          type: "image_url",
          image_url: { url: a.imageDataUrl }
        }))
      ]
    };
  }

  return result;
}

function modelCandidates(requestedModel, hasImages) {
  if (hasImages) return [FREE_VISION_MODEL];

  if (requestedModel && FREE_TEXT_MODELS.includes(requestedModel)) {
    return [
      requestedModel,
      ...FREE_TEXT_MODELS.filter((m) => m !== requestedModel)
    ];
  }

  return FREE_TEXT_MODELS;
}

function extractText(value) {
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    const parts = value.map((item) => extractText(item)).filter(Boolean);
    return parts.length ? parts.join("\n").trim() : null;
  }

  if (value && typeof value === "object") {
    const type = typeof value.type === "string"
      ? value.type.toLowerCase()
      : "";

    if (type && !type.includes("text") && !type.includes("content")) {
      return null;
    }

    for (const field of ["text", "content", "output_text", "value"]) {
      const text = extractText(value[field]);
      if (text) return text;
    }
  }

  return null;
}

function extractAssistantText(data) {
  const direct = extractText(data?.answer);
  if (direct) return direct;

  const choice = data?.choices?.[0];
  const message = choice?.message;

  for (const candidate of [
    message?.content,
    message?.output_text,
    message?.text,
    message?.refusal,
    choice?.text,
    choice?.delta?.content
  ]) {
    const text = extractText(candidate);
    if (text) return text;
  }

  return null;
}

async function callOpenRouter(apiKey, model, messages) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://typesafe-mcp-key-hyouka1.vercel.app",
        "X-Title": "TypeSafe Kotlin App"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.25,
        max_tokens: 4096
      })
    }
  );

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "OpenRouter HTTP " + response.status
    );
    error.status = response.status;
    throw error;
  }

  const answer = extractAssistantText(data);

  if (!answer) {
    const choice = data?.choices?.[0] || {};
    const finishReason = choice?.finish_reason || choice?.native_finish_reason || "";
    const upstreamMessage =
      extractText(data?.error?.message) ||
      extractText(choice?.message?.refusal);
    const detail =
      upstreamMessage ||
      (finishReason ? "finish_reason=" + finishReason : "empty response");
    const error = new Error(
      "OpenRouter returned no assistant text (" + detail + ")."
    );
    error.status = 502;
    throw error;
  }

  return {
    answer,
    model: data?.model || model,
    usage: data?.usage || null
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method Not Allowed" });
  }

  try {
    const apiKey = pickApiKey(req);

    if (!apiKey) {
      return send(res, 401, {
        error: "Missing OpenRouter API key.",
        hint:
          "Set OPENROUTER_API_KEY on Vercel or send X-OpenRouter-API-Key from the app."
      });
    }

    const input = await readJson(req);
    const messages = normalizeMessages(input.messages);
    const attachments = normalizeAttachments(input.attachments);
    const hasImages = attachments.some((a) => a.imageDataUrl);

    if (!messages.length && !attachments.length) {
      return send(res, 400, { error: "Message or attachment is required." });
    }

    const serializedSize = JSON.stringify({
      messages,
      attachments
    }).length;

    if (serializedSize > 4_200_000) {
      return send(res, 413, {
        error: "Request is too large. Use a smaller file or image."
      });
    }

    const finalMessages = buildMessages(messages, attachments);
    const candidates = modelCandidates(
      input.model === "auto" ? null : input.model,
      hasImages
    );

    let lastError = null;

    for (const model of candidates) {
      try {
        const result = await callOpenRouter(
          apiKey,
          model,
          finalMessages
        );
        return send(res, 200, result);
      } catch (error) {
        lastError = error;
        if (![408, 429, 500, 502, 503, 504].includes(error?.status)) {
          break;
        }
      }
    }

    return send(res, lastError?.status || 502, {
      error: lastError?.message || "AI request failed."
    });
  } catch (error) {
    return send(res, 400, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

