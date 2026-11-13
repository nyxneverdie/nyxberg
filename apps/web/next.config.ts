import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  ...(process.env.NYXBERG_TEST_DIST_DIR && /^\.next-local-test-[a-f0-9]+$/.test(process.env.NYXBERG_TEST_DIST_DIR) ? { distDir: process.env.NYXBERG_TEST_DIST_DIR } : {}),
  agentRules: false,
  experimental: { useTypeScriptCli: false },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] }]; },
};
export default config;
