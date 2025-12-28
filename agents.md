# agents.md

## Purpose
- AI agents should treat this repo as a TypeScript/Node service with Vitest tests; keep work focused, incremental, and Windows-aware.
- Preserve the private fork workflow: origin is the writable remote, upstream is fetch-only.

## Branching
- Always start work on a `feature/<short-name>` branch derived from `upstream/main` (never `origin/main` directly).
- Do not push to `upstream`; it is intentionally fetch-only. Push only to `origin` and create PRs from there.

## Sync etiquette
- Sync `main` from upstream with a fast-forward merge to avoid merge commits:

```powershell
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
```

- Confirm `upstream` remains fetch-only so pushes never go there.

## Development workflow
- Install dependencies (yarn lockfile present):

```powershell
yarn install
```

- Run the server in dev mode (loads `.env`/`.env.dev`):

```powershell
yarn dev
```

- No dedicated lint/format script is provided; follow existing style and rely on `yarn build` (TypeScript check) instead of automatic reformatting.
- Run tests with Vitest:

```powershell
yarn test
```

## Efficiency rules
- Avoid repeating full `yarn build` or `yarn test` suites when a targeted subset suffices.
- Prefer incremental commands (e.g., isolated spec files, caching) to keep CI fast.

## Safety rules
- Never print or commit secrets (tokens, passwords, private keys) introduced by environment files.
- Do not alter runtime versions or upgrade large dependency sets unless absolutely required by the task.
- Avoid large refactors; keep diffs focused on the requested change.

## Definition of Done
- Tests covering touched code exist or have been updated.
- All required tests pass locally before pushing (`yarn test` at a minimum, `yarn build` when TypeScript output changes).
- Diff stays small, and commit messages are clear and scoped to the change.

## Common tasks cheat sheet
- Sync main: `git fetch upstream && git checkout main && git merge --ff-only upstream/main && git push origin main`
- Create feature branch: `git fetch upstream && git checkout -b feature/<short-name> upstream/main`
- Run tests: `yarn test`
- Update feature branch from upstream: `git fetch upstream && git rebase upstream/main`
- Push + PR: `git push origin feature/<short-name>` (use `--force-with-lease` only after a rebase) and open a PR on GitHub.
