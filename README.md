# TypeSafe MCP for Key

A stateless Streamable HTTP MCP endpoint backed by TypeSafe System One.

## Endpoint

After deployment:

`https://<deployment-domain>/api/mcp`

## Environment

Set `TYPESAFE_API_KEY` in the hosting provider as a secret. Never commit the key.

## Tools

- `system_one` - run typed TypeSafe decisions
- `health` - health/configuration check

The server uses the official TypeSafe JavaScript SDK and the official MCP TypeScript server package.
