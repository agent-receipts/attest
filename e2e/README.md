# E2E Test: attest-proxy with Claude Desktop

Test the full attest pipeline with Claude Desktop as the MCP client.

## Prerequisites

- Node.js 22.5+ (for `node:sqlite`)
- Claude Desktop installed
- Project built: `pnpm run build`

## Setup

```sh
# From the project root
pnpm run build
node e2e/setup.mjs
```

This will:
1. Generate an Ed25519 key pair in `e2e/data/`
2. Print the MCP config snippet to add to Claude Desktop

## Configure Claude Desktop

1. Open Claude Desktop settings
2. Edit `claude_desktop_config.json`
3. Add the config snippet from the setup script under `"mcpServers"`
4. Restart Claude Desktop

## Test

1. In Claude Desktop, ask it to use the `read_file` or `write_file` tool
   - Example: "Use the read_file tool to read /tmp/hello.txt"
2. The proxy will intercept the tool call and create a signed receipt

## Verify

After Claude Desktop makes some tool calls, check the receipts:

```sh
# List all receipts
node dist/cli/main.js list --db e2e/data/receipts.db

# Inspect a specific receipt
node dist/cli/main.js inspect <receipt-id> --key e2e/data/public.pem --db e2e/data/receipts.db

# Verify chain integrity
node dist/cli/main.js verify <chain-id> --key e2e/data/public.pem --db e2e/data/receipts.db

# Export chain as JSON
node dist/cli/main.js export <chain-id> --db e2e/data/receipts.db > chain.json
```

## What to check

- [ ] Receipts appear in `attest list` after tool calls
- [ ] `attest inspect` shows correct action type (filesystem.file.read / filesystem.file.create)
- [ ] `attest verify` reports chain as valid (✓)
- [ ] Signatures verify against the public key
- [ ] Chain has correct sequence numbers (1, 2, 3...)
- [ ] Each receipt's `previous_receipt_hash` links to the prior receipt

## Clean up

```sh
rm -rf e2e/data/
```

Remove the `attest-sample` entry from `claude_desktop_config.json` and restart Claude Desktop.
