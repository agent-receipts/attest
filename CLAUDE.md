# Attest

Cryptographically signed audit trail for AI agent actions. See `docs/action-receipt-spec-v0.1.md` for the full spec.

## Toolchain

- **Language:** TypeScript (ESM)
- **Package manager:** pnpm (via corepack)
- **Linting & formatting:** Biome (tabs, double quotes)
- **Testing:** vitest
- **Git hooks:** lefthook (pre-commit: lint + typecheck)

## Commands

```sh
pnpm run build        # tsc
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # biome check .
pnpm run lint:fix     # biome check --write .
pnpm run check        # typecheck + lint
pnpm run test         # vitest run
pnpm run test:watch   # vitest
```

## Project structure

```
src/
  receipt/      # receipt creation, signing, chain management
  store/        # SQLite persistence
  taxonomy/     # action type mapping + risk levels
  proxy/        # MCP proxy emitter
```

## Workflow

- All changes go through pull requests — never push directly to main
- Always request review from `@copilot` when creating a PR

## Code conventions

- Use `import type` for type-only imports (enforced by `verbatimModuleSyntax`)
- All files use `.ts` extension, output to `dist/`
- Test files: `*.test.ts` alongside source files in `src/`
- Run `pnpm run lint:fix` before committing to match Biome formatting
