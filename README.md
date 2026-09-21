# TypeSafe MCP for Key

Public Streamable HTTP MCP bridge for TypeSafe AI System One.

Endpoint after deployment:
https://typesafe-mcp-key-hyouka1.vercel.app/

Authentication:
- Preferred for Key/custom MCP clients: send `X-TypeSafe-API-Key`.
- Standard Bearer Authorization is also accepted.
- `TYPESAFE_API_KEY` may be configured as a server environment variable.

The credential is intentionally not committed to the repository.

Tools:
- `health`
- `system_one`

The MCP HTTP implementation follows the official Model Context Protocol TypeScript SDK HTTP handler and Node adapter. The TypeSafe integration uses the official JavaScript SDK.
