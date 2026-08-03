import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'LedgerLine — Subscription & Anomaly Detection',
    template: '%s — LedgerLine',
  },
  description:
    'Automatically detect subscriptions, money leaks, and unusual spending with trained ML models — real applied machine learning, not LLM prompts.',
  keywords: ['ledgerline', 'fintech', 'subscription detection', 'anomaly detection', 'machine learning', 'expense tracking'],

  // ── Icons ────────────────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.svg',
  },

  // ── Open Graph ───────────────────────────────────────────────────────────────
  openGraph: {
    title: 'LedgerLine',
    description: 'Smart subscription & anomaly detection powered by real ML models',
    type: 'website',
    url: 'https://ledgerline-lac.vercel.app',
    siteName: 'LedgerLine',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'LedgerLine — ML-powered expense intelligence',
      },
    ],
  },

  // ── Twitter card ─────────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: 'LedgerLine — Subscription & Anomaly Detection',
    description: 'Smart subscription & anomaly detection powered by real ML models',
    images: ['/og-image.png'],
  },

  // ── App manifest ─────────────────────────────────────────────────────────────
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} style={{ background: '#FAF9F6' }}>
      <head>
        {/* SVG favicon — supported by all modern browsers, scales perfectly */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/* PNG fallback for older browsers / bookmarks */}
        <link rel="icon" href="/icon-512.png" sizes="512x512" type="image/png" />
        {/* Apple home screen icon */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Theme color (browser chrome / Android PWA) */}
        <meta name="theme-color" content="#22304A" />
      </head>
      <body style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#FAF9F6' }}>
        {children}
      </body>
    </html>
  );
}
