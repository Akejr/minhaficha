import type { MetadataRoute } from "next";

/**
 * PWA manifest. Lets the user "Add to Home Screen" on iOS / Android and
 * launch the app in fullscreen, with our brand colors as theme/background.
 *
 * Files placed in /app are served at the site root, so this becomes
 * /manifest.webmanifest automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ApostAI",
    short_name: "ApostAI",
    description:
      "Análise de probabilidades de jogos com IA. Sugestões de baixo, médio e alto risco em segundos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#131313",
    theme_color: "#131313",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-mask.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
