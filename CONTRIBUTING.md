# Contributing to Attest

## Getting started

```sh
git clone https://github.com/ojongerius/attest.git
cd attest
npm install -g corepack && corepack enable
pnpm install
```

## Development

```sh
pnpm run check        # typecheck + lint
pnpm run test         # run tests
pnpm run test:watch   # run tests in watch mode
pnpm run lint:fix     # auto-fix formatting
```

Lefthook runs lint and typecheck automatically on pre-commit.

## Code style

- Formatting and linting handled by [Biome](https://biomejs.dev/) — tabs, double quotes
- Run `pnpm run lint:fix` before committing
- Install the Biome editor extension for format-on-save

## Pull requests

- One logical change per PR
- Include tests for new functionality
- All CI checks must pass (typecheck, lint, test)
- Reference the relevant issue number in the PR description

## Issues

Check the [milestones](https://github.com/ojongerius/attest/milestones) for current priorities. If you're picking up an issue, leave a comment so others know.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 license.
