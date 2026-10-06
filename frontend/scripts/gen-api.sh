#!/bin/sh
# Типы API генерируются из схемы backend (руками не дублируются — см. CLAUDE.md).
set -eu
cd "$(dirname "$0")/.."
(cd ../backend && uv run python -m app.cli export-openapi) > lib/api/openapi.json
pnpm exec openapi-typescript lib/api/openapi.json -o lib/api/schema.d.ts
