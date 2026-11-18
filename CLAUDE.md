@AGENTS.md

<!-- Add Claude Code-specific guidance here only when it has no AGENTS.md counterpart. -->

## Verifying changes

- Engine (repo root): `npm run lint` then `node test-all.mjs`
- Web UI (`web/`): `npm run typecheck`, `npm test`, `npm run build`
- Rolewright hosted app (`rolewright/`): `npm run typecheck`, `npm test`, `npm run build`
- Run the checks for the area you changed before reporting work as done, and report failures with their output.
