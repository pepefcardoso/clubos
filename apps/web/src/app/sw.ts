import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  StaleWhileRevalidate,
  NetworkFirst,
  ExpirationPlugin,
  CacheableResponsePlugin,
} from "serwist";
import { defaultCache } from "@serwist/next/worker";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const STATIC_ASSET_CACHE = "static-assets-v1";
const IMAGE_CACHE = "image-assets-v1";
const API_CACHE = "api-responses-v1";
const PAGES_CACHE = "pages-v1";

const API_BASE_PATTERN = /\/api\//i;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,

  skipWaiting: true,

  clientsClaim: true,

  navigationPreload: true,

  runtimeCaching: [
    {
      matcher: /\/_next\/static\/.*/i,
      handler: new StaleWhileRevalidate({
        cacheName: STATIC_ASSET_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }),
    },

    {
      matcher: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|woff|woff2|ttf|otf|eot)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: IMAGE_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }),
    },

    {
      matcher: API_BASE_PATTERN,
      handler: new NetworkFirst({
        cacheName: API_CACHE,
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }),
    },

    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 16,
            maxAgeSeconds: 24 * 60 * 60,
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }),
    },

    ...defaultCache,
  ],
});

serwist.addEventListeners();

const WORKLOAD_SYNC_TAG = "sync-workload-sessions";

self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag !== WORKLOAD_SYNC_TAG) return;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: false,
      });

      if (clients.length > 0) {
        for (const client of clients) {
          client.postMessage({ type: "TRIGGER_WORKLOAD_SYNC" });
        }
        return;
      }

      const { syncFromServiceWorker, getActiveClubIdRaw } = await import(
        /* webpackChunkName: "sw-workload-sync" */
        "../lib/sw/workload-sync"
      );

      const clubId = await getActiveClubIdRaw();
      if (!clubId) {
        return;
      }

      await syncFromServiceWorker(clubId);
    })(),
  );
});
