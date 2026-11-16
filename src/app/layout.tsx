import type { Metadata, Viewport } from 'next';
import './globals.css';
// import './fonts.css'; // ative quando os arquivos da Gotham estiverem em /public/fonts

export const metadata: Metadata = {
  title: 'Arco Contents · Aprovação',
  description: 'Calendário e aprovação de conteúdo da Arco Contents.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Arco', statusBarStyle: 'default' }
};

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
