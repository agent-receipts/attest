# Copilot Review Instructions

## Security

- No secrets, API keys, or credentials in code or config
- Ed25519 private keys must never be logged or included in receipts
- Parameters must be hashed, never stored in plaintext in receipts
- No command injection or unsanitized input passed to shell execution

## Correctness

- Receipt schema must conform to W3C Verifiable Credentials Data Model 2.0 shape
- Hash chain integrity: every receipt must reference the previous receipt's hash
- Canonical JSON (RFC 8785) must be used before hashing — the proof field must be excluded from the hash input
- Ed25519 signatures must be verified against the issuer's public key
- Chain sequence numbers must be strictly incrementing

## Code quality

- TypeScript strict mode — no `any` types, no type assertions without justification
- Use `import type` for type-only imports
- Tests for all public functions
- No unused dependencies or dead code
- Error handling at system boundaries (file I/O, SQLite, network)

## Style

- Biome handles formatting — don't flag style issues that Biome allows
- Prefer explicit over clever
- Keep functions small and focused
