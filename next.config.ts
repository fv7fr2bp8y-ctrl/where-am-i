import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Главната страница да не се кешира — така всеки деплой се хваща веднага
        // (хешираните файлове в /_next/static си остават кеширани и бързи)
        source: "/",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
