import type { Metadata, Viewport } from "next";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApostAI",
  description:
    "Análise de probabilidades de jogos com IA. Sugestões de baixo, médio e alto risco em segundos.",
  // iOS PWA — when "Add to Home Screen" is used the app opens in fullscreen.
  appleWebApp: {
    capable: true,
    title: "ApostAI",
    statusBarStyle: "black-translucent",
  },
  // Treat the icon used by the home screen the same as the manifest icon.
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#131313",
  // "cover" lets the app paint behind the iOS status bar / Dynamic Island,
  // exposing safe-area-inset-* CSS env() variables that we use to push our
  // own header/footer below/above the system UI.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0a0a0a] text-on-background font-body-md min-h-screen relative overflow-x-hidden antialiased">
        <div className="bg-background min-h-screen mx-auto w-full max-w-[440px] relative shadow-[0_0_80px_rgba(0,0,0,0.6)]">
          {children}
        </div>
        {/* Support FAB, present on every route. Sits above the bottom nav. */}
        <WhatsAppButton />
      </body>
    </html>
  );
}
