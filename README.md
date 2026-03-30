<div align="center">

# Attest

### Cryptographically signed audit trail for AI agent actions

[![CI](https://github.com/ojongerius/attest/actions/workflows/ci.yml/badge.svg)](https://github.com/ojongerius/attest/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

---

**AI agents act on your behalf. Attest proves what they did.**

An open protocol for **Action Receipts** — signed, hash-chained records of every action an AI agent takes.
Like [C2PA Content Credentials](https://c2pa.org/), but for agent actions instead of media files.

[Spec](docs/action-receipt-spec-v0.1.md) &bull; [FAQ](docs/faq.md) &bull; [Quick Start](#quick-start) &bull; [CLI](#cli) &bull; [Claude Desktop Setup](#usage-with-claude-desktop)

</div>

---

## The problem

If a regulator, auditor, or your own security team asked what your AI agents did last Tuesday — could you answer? Not what they were asked to do. What they *actually* did. Across which systems, in what order, with what outcomes. In a format someone could independently verify.

For almost every organisation, the answer is no. AI agents send emails, modify documents, execute commands, and make purchases — but every vendor logs differently (if they log at all), in proprietary formats, with no way to verify the records haven't been tampered with. There's no unified view across tools. No chain of custody. No receipt.

The EU AI Act mandates traceability for high-risk AI systems. The regulation exists. The standard for how to comply doesn't.

## How Attest solves it

Every agent action produces a **receipt** — a [W3C Verifiable Credential](https://www.w3.org/TR/vc-data-model-2.0/) signed with Ed25519:

| Receipt field | What it captures |
|:---|:---|
| **Action** | What happened, classified by a standardized taxonomy |
| **Principal** | Who authorized it (human or org) |
| **Issuer** | Which agent performed it |
| **Outcome** | Success/failure, reversibility, undo method |
| **Chain** | Hash link to the previous receipt (tamper-evident) |
| **Privacy** | Parameters are hashed, never stored in plaintext |

Receipts are hash-chained — if anyone modifies or deletes one, the chain breaks and you'll know.

The protocol is **agent-agnostic**. It does not assume MCP, OpenAI function calling, or any specific agent framework. Any agent that can produce JSON and sign it can emit receipts.

See the [full specification](docs/action-receipt-spec-v0.1.md) for schema details, chain verification rules, and design decisions.

## The goal

Attest is a spec and reference implementation — the goal isn't adoption of this tool, it's adoption of the protocol. Imagine: your organisation runs Claude, ChatGPT, and a custom agent. All three emit Action Receipts in the same format. One audit trail, cryptographically signed, hash-chained, independently verifiable. Your compliance team can answer "what did our AI agents do?" without stitching together five different log formats.

Getting there requires the spec to be shaped by people with real-world experience in compliance, audit, and regulated AI deployment. The most valuable contributions right now aren't code — they're domain expertise. If you work in a regulated industry deploying AI agents, [open an issue](https://github.com/ojongerius/attest/issues) or comment on the [spec](docs/action-receipt-spec-v0.1.md).

## Action Taxonomy

Attest defines a hierarchical vocabulary of action types organized by domain (`filesystem.file.read`, `communication.email.send`, `financial.payment.initiate`, etc.) with four risk levels:

| Level | Description |
|---|---|
| `low` | Read-only or easily reversible |
| `medium` | Modifies state but reversible or low-impact |
| `high` | Significant state change, may be hard to reverse |
| `critical` | Financial commitment or irreversible action |

The taxonomy is extensible — implementations can add domain-specific types and override default risk levels via configuration.

## Reference Implementation

This repository contains a TypeScript reference implementation: an MCP proxy that sits between an MCP client and server, intercepting tool calls and emitting signed Action Receipts.

```
                         Attest Proxy
                    ┌───────────────────┐
 ┌──────────┐      │  intercept         │      ┌──────────┐
 │MCP Client│─────▶│  classify          │─────▶│MCP Server│
 │ (Claude) │◀─────│  sign              │◀─────│          │
 └──────────┘      │  chain             │      └──────────┘
                    └────────┬──────────┘
                             │
                             ▼
                    ┌───────────────────┐
                    │  SQLite Receipt   │
                    │  Store            │
                    └───────────────────┘
```

The proxy sits transparently between an MCP client and server. For each `tools/call` it creates a signed, hash-chained receipt and persists it locally.

### Key features

| | Feature | Detail |
|:---|:---|:---|
| **Ed25519 signing** | Every receipt is cryptographically signed | `node:crypto`, zero external deps |
| **Hash chaining** | SHA-256 + RFC 8785 canonical JSON | Tamper-evident append-only log |
| **W3C VC format** | Receipts conform to Verifiable Credentials 2.0 | Interoperable, standards-based |
| **Action taxonomy** | 15 action types across filesystem & system domains | Risk-classified (low/medium/high/critical) |
| **Privacy by default** | Parameters hashed, not stored | Human principal controls disclosure |
| **Agent-agnostic** | Works with any agent that produces JSON | MCP is first target, not the only one |
| **150+ tests** | Comprehensive coverage | Zero external runtime dependencies |

### Quick start

```sh
pnpm install
pnpm run build      # compile TypeScript
pnpm run test       # run all tests
pnpm run check      # typecheck + lint
```

### Usage with Claude Desktop

Add `attest-proxy` as an MCP server wrapper in your `claude_desktop_config.json`:

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

### CLI

```sh
attest list --db receipts.db                         # list all receipts
attest list --db receipts.db --risk high             # filter by risk level
attest list --db receipts.db --watch 2               # live tail (refresh every 2s)
attest inspect urn:receipt:abc --key pub.pem --db receipts.db   # receipt detail + sig check
attest verify chain_abc --key pub.pem --db receipts.db          # verify chain integrity
attest export chain_abc --db receipts.db > chain.json           # export chain as JSON
attest stats --db receipts.db                                   # store statistics
```

<details>
<summary><b>Example output</b></summary>

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

</details>

### Project structure

```
src/
  receipt/      # Receipt creation, Ed25519 signing, RFC 8785 hashing, chain verification
  store/        # SQLite persistence and chain integrity verification
  taxonomy/     # Action type classification (15 types) + config file loading
  proxy/        # MCP STDIO proxy, tools/call interceptor, receipt emitter
  cli/          # list, inspect, export, verify commands
```

## Roadmap

### Protocol

- Expand taxonomy to communication, documents, financial, and data domains
- Multi-agent chain linking (delegation across agent boundaries)
- Trusted timestamps (RFC 3161)
- Formal standalone specification document

### Implementation

**Core implementation complete** — see the [full spec](docs/action-receipt-spec-v0.1.md).

| | Milestone | Status |
|:---|:---|:---|
| [M1](https://github.com/ojongerius/attest/milestone/1) | Receipt Core — create, sign, chain, verify | Done |
| [M2](https://github.com/ojongerius/attest/milestone/2) | Storage — SQLite persistence and querying | Done |
| [M3](https://github.com/ojongerius/attest/milestone/3) | MCP Proxy Emitter — intercept tool calls, emit receipts | Done |
| [M4](https://github.com/ojongerius/attest/milestone/4) | CLI — verify, inspect, list, export, stats | Done |
| [M5](https://github.com/ojongerius/attest/milestone/5) | Integration Testing — E2E, sample server, binaries | Done |
| [M6](https://github.com/ojongerius/attest/milestone/6) | Developer Adoption — npm publish, API docs | Next |
| [M7](https://github.com/ojongerius/attest/milestone/7) | Expanded Taxonomy — communication, financial, data | Planned |
| [M8](https://github.com/ojongerius/attest/milestone/8) | Production Hardening — trusted timestamps, key mgmt | Planned |
| [M9](https://github.com/ojongerius/attest/milestone/9) | Web Viewer — timeline, chain visualization | Planned |
| [M10](https://github.com/ojongerius/attest/milestone/10) | Compliance — EU AI Act export, SIEM, C2PA | Planned |

## Prior art

Attest builds on [beacon](https://github.com/ojongerius/beacon), an earlier audit proxy prototype. Attest adds cryptographic signing, hash chaining, W3C VC conformance, a formal spec, and a CLI.

## License

Apache 2.0 — see [LICENSE](LICENSE).
