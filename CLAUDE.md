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
- Always request review from `Copilot` when creating a PR (use the API: `gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers -X POST --input -` with `{"reviewers":["Copilot"]}`; the `--reviewer` flag on `gh pr create` doesn't support bot reviewers)

## Self-review before push

Re-read every changed file with fresh eyes before committing. Check for:

- **Input validation**: empty strings, missing fields, unexpected types, duplicates
- **Resource cleanup**: streams, readers, DB connections, event listeners, timers
- **Unbounded growth**: maps/arrays that grow per-request without cleanup or caps
- **Security**: string interpolation in SQL/commands, unsanitized user input
- **Guard rails**: double-init, double-attach, use-after-close
- **Test gaps**: is there a test for the error/edge path, not just the happy path?

Fix issues and amend the commit — don't push a separate "fix review feedback" commit.

## Code conventions

- Use `import type` for type-only imports (enforced by `verbatimModuleSyntax`)
- All files use `.ts` extension, output to `dist/`
- Test files: `*.test.ts` alongside source files in `src/`
- Run `pnpm run lint:fix` before committing to match Biome formatting
