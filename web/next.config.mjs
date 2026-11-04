// 公開部署嘅基本安全 header。
// 未加 CSP:MapLibre 要 blob: worker 同 OpenFreeMap 嘅 tile/字型 host,
// 要逐個列清楚先開得,否則地圖會靜靜雞壞咗。
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // packages/core 係未編譯嘅 TypeScript 源碼
  transpilePackages: ['@unfoodie/core'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
