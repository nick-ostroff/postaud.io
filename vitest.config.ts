import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    // Stub values for src/lib/env.ts's required fields so unit tests can call
    // env() without real Supabase/Anthropic credentials. Real API calls are
    // always mocked at the SDK boundary — these values are never sent anywhere.
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // The real `server-only` package throws outside Next's RSC bundler —
      // see src/test/stubs/server-only.ts for why this is stubbed.
      "server-only": new URL("./src/test/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
});
