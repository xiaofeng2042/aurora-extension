# Repository Guidelines

## Project Structure & Module Organization
Maintain a predictable layout as modules land.
- `src/`: Production code grouped by feature (e.g., `src/agents/`, `src/services/`, `src/interfaces/`).
- `tests/`: Mirror `src/` layout; name files `test_<feature>_<behavior>.py` (or language equivalent).
- `scripts/`: Executable helpers for setup, linting, and orchestration; keep them POSIX-compatible.
- `docs/`: Architecture notes, ADRs, and runbooks; update whenever flows change.
- `assets/`: Sample payloads, fixtures, and non-code artifacts referenced in tests or docs.

## Build, Test, and Development Commands
Wrap day-to-day tasks in scripts so they stay reproducible across environments.
- `./scripts/bootstrap.sh` — install dependencies; keep the script idempotent.
- `./scripts/dev.sh` — run the primary agent or service locally.
- `./scripts/test.sh` — execute the full test suite; accept `--unit` or `--integration` flags.
- `./scripts/lint.sh` — format and lint the codebase; fail fast on violations.

## Coding Style & Naming Conventions
- Default to 4-space indentation for Python/JSON/YAML; tabs only where required (e.g., Makefiles).
- Prefer type-hinted, side-effect-light functions; consolidate shared helpers under `src/shared/`.
- File names: `lower_snake_case` for modules, `kebab-case` for scripts, `UPPER_SNAKE_CASE` for constants.
- Run formatters and linters (`black`, `ruff`, `prettier`, or stack-appropriate tooling) before committing.
- Keep modules focused; extract reusable pieces into dedicated utility modules early.

## Testing Guidelines
- Use `pytest` (or the stack's native test runner) with descriptive names (`test_<feature>_<behavior>.py`).
- Place reusable fixtures in `tests/fixtures/`; store sample payloads alongside in `assets/fixtures/`.
- Target ≥85% branch coverage for new code; document any intentional gaps in the PR description.
- Integration tests should stub external services via adapters under `tests/integration/`.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`); keep subjects ≤72 characters with imperative voice.
- Scope each PR to one logical change set and include accompanying tests (or explain why not).
- PR descriptions must cover context, solution outline, verification steps (link to `./scripts/test.sh` output), and follow-ups.
- Attach screenshots, logs, or trace excerpts when behavior, APIs, or UI change to aid review.

## Security & Configuration Tips
- Never commit secrets; use a gitignored `.env.local` and document required variables in `docs/configuration.md`.
- Pin dependencies via lockfiles; review supply-chain updates before merging.
- Sanitize any recorded data before adding to `assets/`; prefer synthetic fixtures for reproducibility.
