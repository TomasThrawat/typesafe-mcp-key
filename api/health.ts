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

export default async function health(_request: Request): Promise<Response> {
  return json({
    ok: true,
    server: "typesafe-mcp-key",
    mobileApi: true,
    typesafeConfigured: Boolean(process.env.TYPESAFE_API_KEY)
  });
}
