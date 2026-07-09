# AGENTS.md

## Cursor Cloud specific instructions

SiteLens is a single-service front-end app: a React + TypeScript + Vite dashboard
with a MapLibre GL map (no backend yet).

- Dev server: `npm run dev` (Vite, serves on port `5173`). Use `npm run dev -- --host`
  to expose it on the VM network.
- Standard scripts live in `package.json`: `typecheck` (`tsc -b`), `lint` (`oxlint`),
  `build` (`tsc -b && vite build`), `preview`.
- The map uses the no-token public style `https://demotiles.maplibre.org/style.json`,
  so rendering the basemap requires outbound network access to that host.
- `tsconfig.app.json` enables `verbatimModuleSyntax`, so type-only imports MUST use
  `import type { ... }` or `tsc`/build will fail.
- This project pulls in a modern Material UI major version where `Typography` does
  not accept `lineHeight` as a direct prop — set it via the `sx` prop instead.
