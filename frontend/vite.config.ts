import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "icons/*.png"],
      // Web Push (PRODUCT_SPEC §4.10): generateSW를 유지하고 importScripts로
      // public/push-sw.js(push·notificationclick 핸들러)만 덧붙인다.
      // injectManifest 전환 대비 이 방식이 기존 프리캐시·autoUpdate 동작을
      // 그대로 보존해 회귀 위험이 없고 워커 코드도 정적 파일 하나로 끝난다.
      workbox: {
        importScripts: ["push-sw.js"],
      },
      manifestFilename: "manifest.json",
      manifest: {
        name: "CHME - Challenge Earth with ME",
        short_name: "CHME",
        description: "7일간의 짧고 강렬한 챌린지 플랫폼",
        theme_color: "#FF9B71",
        background_color: "#FFFFFF",
        display: "standalone",
        icons: [
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          // 192 슬롯도 동일 파일로 채운다(별도 리사이즈 없이 브라우저가 축소).
          {
            src: "icons/icon-512.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    open: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    outDir: "dist",
    // 프로덕션 빌드에서는 소스맵 제외 (비프로덕션 빌드만 생성)
    sourcemap: mode !== "production",
  },
}));
