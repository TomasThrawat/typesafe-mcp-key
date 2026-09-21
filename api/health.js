function sendJson(res, data, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-TypeSafe-API-Key, Authorization");
  return res.json(data);
}

export default async function health(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-TypeSafe-API-Key, Authorization");
    return res.end();
  }

  if (req.method !== "GET") {
    return sendJson(res, { error: "Method Not Allowed" }, 405);
  }

  return sendJson(res, {
    ok: true,
    server: "typesafe-mcp-key",
    mobileApi: true,
    typesafeConfigured: Boolean(process.env.TYPESAFE_API_KEY)
  });
}
