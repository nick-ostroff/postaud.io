// Vitest stub for the `server-only` package.
//
// The real package throws when imported outside Next's RSC bundler (see
// node_modules/server-only/index.js) — it exists purely to make webpack/
// turbopack fail a *build* if a server-only module leaks into a client
// bundle. That guard is meaningless under Vitest/Node, so we alias the bare
// specifier to this no-op file (see vitest.config.ts) instead of installing
// the throwing behavior in every query test.
export {};
