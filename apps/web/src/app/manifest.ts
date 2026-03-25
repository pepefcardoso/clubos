import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClubOS — Gestão de Clubes",
    short_name: "ClubOS",
    description:
      "Gestão financeira para clubes de futebol: cobranças Pix, controle de sócios e régua de cobrança via WhatsApp.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fafaf8",
    theme_color: "#2d7d2d",
    categories: ["finance", "business", "sports"],
    lang: "pt-BR",
    dir: "ltr",
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Ver resumo financeiro do clube",
        url: "/dashboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Cobranças",
        short_name: "Cobranças",
        description: "Gerenciar cobranças de sócios",
        url: "/charges",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
