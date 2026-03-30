# Frequently Asked Questions

## General

### What is Attest?

Attest is an open protocol and reference implementation for **Action Receipts** — cryptographically signed, hash-chained records of every action an AI agent takes on your behalf. Think [C2PA Content Credentials](https://c2pa.org/), but for agent actions instead of media files.

### Why does this matter?

AI agents send emails, modify documents, execute commands, and make purchases — but there's no standard way to record what they did, verify the records haven't been tampered with, or produce an audit trail that works across different agent platforms. Attest fills that gap.

### Is this just another logging tool?

No. Logging captures events. Attest produces **receipts** — each one is cryptographically signed and hash-chained to the previous receipt. If anyone modifies or deletes a receipt, the chain breaks and you'll know. Receipts also conform to the [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/) data model, making them interoperable and independently verifiable.

### Who is this for?

- **Compliance teams** who need to answer "what did our AI agents do?" for regulators or auditors
- **Security teams** who want a tamper-evident record of agent actions
- **Developers** building agent systems who want built-in auditability
- **Organisations** deploying AI in regulated industries (finance, healthcare, legal)

### Does this only work with Claude?

No. The protocol is **agent-agnostic**. It doesn't assume MCP, OpenAI function calling, or any specific agent framework. Any agent that can produce JSON and sign it can emit receipts. The reference implementation happens to be an MCP proxy because that's where the ecosystem is today.

---

## Protocol

### What's in a receipt?

Each receipt captures: what action was taken, who authorized it, which agent performed it, whether it succeeded, whether it can be undone, and a hash link to the previous receipt. Parameters are hashed for privacy — never stored in plaintext. See the [full spec](action-receipt-spec-v0.1.md) for schema details.

### What is hash chaining?

Each receipt includes a SHA-256 hash of the previous receipt, forming an append-only chain. If someone modifies or removes a receipt in the middle, the hashes won't match and the tampering is detectable. This is the same integrity mechanism used by C2PA and blockchain-based systems.

### How are receipts signed?

Ed25519 signatures using Node.js built-in `crypto` — zero external cryptographic dependencies. Each receipt's `proof` field contains the signature, following the W3C VC Data Integrity pattern.

### What does "privacy by default" mean?

Action parameters (e.g., the contents of an email, the file path being read) are hashed before being stored in a receipt. The receipt proves what type of action happened and whether it succeeded, without revealing the actual data. The human principal controls whether to disclose the original parameters.

### How does the action taxonomy work?

Attest defines a hierarchical vocabulary of action types organized by domain (e.g., `filesystem.file.read`, `communication.email.send`) with four risk levels: `low`, `medium`, `high`, and `critical`. Tool calls are mapped to action types via a taxonomy configuration file. Unrecognized tools fall back to `unknown` with medium risk.

---

## Reference Implementation

### How does the MCP proxy work?

The proxy sits between an MCP client (like Claude Desktop) and an MCP server. It intercepts `tools/call` JSON-RPC requests and responses, classifies each tool call using the action taxonomy, creates a signed and hash-chained receipt, and persists it to a local SQLite database. The proxy is transparent — the client and server don't know it's there.

### What are the runtime dependencies?

None beyond Node.js. The implementation uses only built-in Node.js modules (`crypto`, `fs`, `path`, etc.) and better-sqlite3 for storage. No external cryptographic libraries.

### Can I use this in production?

The project is in early stages. The core protocol and reference implementation are functional, but features like trusted timestamps (RFC 3161), key management, and multi-agent chain linking are not yet implemented. See the [roadmap](../README.md#roadmap) for what's planned.

### How do I verify a receipt chain?

Use the CLI:

```sh
attest verify <chain_id> --key public.pem --db receipts.db
```

This checks every signature in the chain and confirms that each receipt's hash matches the next receipt's `previous_receipt_hash` field.

---

## Compliance

### Does this help with EU AI Act compliance?

The EU AI Act mandates traceability for high-risk AI systems. Attest provides a standardized, cryptographically verifiable format for recording agent actions — which is a building block for traceability. However, compliance is broader than just logging; Attest doesn't handle risk assessment, governance, or reporting on its own.

### How does this relate to C2PA?

C2PA provides signed provenance manifests for media assets (images, video, audio). Attest extends the same concept to agent actions. The two are complementary — an agent that generates an image could produce both a C2PA manifest for the image and an Attest receipt for the action. Future work may explore formalizing Attest as a C2PA extension.

---

## Contributing

### How can I contribute?

The most valuable contributions right now are **domain expertise** — if you work in a regulated industry deploying AI agents, your input on the spec and taxonomy is more valuable than code. See [CONTRIBUTING.md](../CONTRIBUTING.md) for details, or [open an issue](https://github.com/ojongerius/attest/issues).

### I want to add a new action type to the taxonomy. How?

The taxonomy is extensible. For the reference implementation, you can add custom action types via the taxonomy configuration JSON file. For additions to the core spec taxonomy, [open an issue](https://github.com/ojongerius/attest/issues) describing the domain and action types you need.
