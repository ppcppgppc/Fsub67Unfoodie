/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // packages/core 係未編譯嘅 TypeScript 源碼
  transpilePackages: ['@unfoodie/core'],
};
