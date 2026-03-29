# Attest

Cryptographically signed audit trail for AI agent actions.

Attest is an open protocol and reference implementation for **Action Receipts** — signed, hash-chained records of what an AI agent did, why, whether it succeeded, and whether it can be undone.

## Why

AI agents act on behalf of humans — sending emails, modifying documents, executing commands. No open standard exists for recording these actions in a way that is tamper-evident, privacy-preserving, and machine-verifiable.

Attest fills this gap.

## How it works

Each action an agent takes produces a **receipt**: a W3C Verifiable Credential signed with Ed25519, containing:

- **What** happened (action type from a standardized taxonomy)
- **Who** authorized it (the human principal)
- **Which agent** performed it (the issuer)
- **Whether it succeeded** (outcome and reversibility)
- **Chain integrity** (hash link to the previous receipt)

Parameters are hashed, not stored in plaintext. The human principal controls what is disclosed.

## Architecture

```
┌─────────────┐    JSON-RPC     ┌─────────────┐    JSON-RPC     ┌─────────────┐
│  MCP Client  │ ──────────────▶│  Attest      │ ──────────────▶│  MCP Server  │
│  (Claude)    │ ◀──────────────│  Proxy       │ ◀──────────────│              │
└─────────────┘                 └──────┬───────┘                └─────────────┘
                                       │
                                       │ intercepts tools/call
                                       │ classifies, signs, chains
                                       ▼
                                ┌─────────────┐
                                │   SQLite     │
                                │   Receipt    │
                                │   Store      │
                                └─────────────┘
```

The proxy sits transparently between an MCP client and server, intercepting `tools/call` requests and responses. For each tool call it creates a signed, hash-chained receipt and persists it to SQLite.

## Project structure

```
src/
  receipt/      # Receipt creation, Ed25519 signing, RFC 8785 hashing, chain verification
  store/        # SQLite persistence and chain integrity verification
  taxonomy/     # Action type classification (15 types) + config file loading
  proxy/        # MCP STDIO proxy, tools/call interceptor, receipt emitter
  cli/          # list, inspect, export, verify commands
```

## Status

**Core implementation complete.** See [docs/action-receipt-spec-v0.1.md](docs/action-receipt-spec-v0.1.md) for the full spec.

- 150+ tests, zero external dependencies (uses `node:crypto`, `node:sqlite`)
- Ed25519 signing with RFC 8785 canonical JSON and SHA-256 hashing
- Hash-chained receipts with tamper detection
- SQLite store with indexed querying
- MCP STDIO proxy with tool call interception and receipt emission
- CLI commands for listing, inspecting, exporting, and verifying receipts

## Roadmap

| Milestone | Description | Status |
|---|---|---|
| [M1: Receipt Core](https://github.com/ojongerius/attest/milestone/1) | Create, sign, chain, and verify receipts | Done |
| [M2: Storage](https://github.com/ojongerius/attest/milestone/2) | SQLite persistence and querying | Done |
| [M3: MCP Proxy Emitter](https://github.com/ojongerius/attest/milestone/3) | Intercept MCP tool calls, emit receipts | Done |
| [M4: CLI](https://github.com/ojongerius/attest/milestone/4) | Verify, inspect, list, and export receipts | Done |
| [M5: Integration Testing](https://github.com/ojongerius/attest/milestone/5) | End-to-end tests with real MCP clients | Planned |

## Quick start

```sh
pnpm install
pnpm run build      # compile TypeScript
pnpm run test       # run all tests
pnpm run check      # typecheck + lint
```

## Usage with Claude Desktop

Add attest-proxy as an MCP server wrapper in your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server-attested": {
      "command": "node",
      "args": [
        "/path/to/attest/dist/proxy/main.js",
        "--db", "/path/to/receipts.db",
        "--taxonomy", "/path/to/taxonomy.json",
        "--key", "/path/to/private.pem",
        "--issuer", "did:agent:claude-desktop",
        "--principal", "did:user:you",
        "node", "/path/to/your-mcp-server.js"
      ]
    }
  }
}
```

Every tool call Claude makes through this server will produce a signed, hash-chained receipt in the SQLite database.

See [e2e/README.md](e2e/README.md) for a complete setup guide with a sample MCP server.

## CLI

```sh
# List receipts (with optional filters)
attest list --db receipts.db --risk high --status failure

# Watch for new receipts (refreshes every 2 seconds)
attest list --db receipts.db --watch 2

# Inspect a specific receipt (with signature verification)
attest inspect urn:receipt:abc123 --key public.pem --db receipts.db

# Verify chain integrity
attest verify chain_abc --key public.pem --db receipts.db

# Export chain as JSON bundle
attest export chain_abc --db receipts.db > chain.json

# Show store statistics
attest stats --db receipts.db
```

## Example output

After proxying three tool calls (two `read_file`, one `write_file`) through `attest-proxy`:

```
$ attest list --db receipts.db

CHAIN                  ST  RISK      ACTION                          TIMESTAMP                     ID
demo_session_001#1  ✓  LOW       filesystem.file.read            2026-03-29T07:12:19.638Z  urn:receipt:f3c5a1e1-...
demo_session_001#2  ✓  LOW       filesystem.file.create          2026-03-29T07:12:19.645Z  urn:receipt:5964d07c-...
demo_session_001#3  ✓  LOW       filesystem.file.read            2026-03-29T07:12:19.647Z  urn:receipt:7b4c7399-...
```

```
$ attest inspect urn:receipt:f3c5a1e1-... --key public.pem --db receipts.db

Receipt:    urn:receipt:f3c5a1e1-a097-417d-b1c3-da40cd806502
Issued:     2026-03-29T07:12:19.638Z
Issuer:     did:agent:claude-desktop
Principal:  did:user:otto

Action:     filesystem.file.read
Risk:       low
Timestamp:  2026-03-29T07:12:19.638Z
Status:     success

Chain:      demo_session_001
Sequence:   1
Previous:   (none)

Signature:  ✓ valid
```

```
$ attest verify demo_session_001 --key public.pem --db receipts.db

Chain:    demo_session_001
Receipts: 3
Status:   ✓ valid
```

```
$ attest stats --db receipts.db

Receipts: 3
Chains:   1

By risk level:
  low        3

By status:
  success    3

By action type:
  filesystem.file.read           2
  filesystem.file.create         1
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
