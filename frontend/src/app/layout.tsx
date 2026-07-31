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
  title: 'LedgerLine — Subscription & Anomaly Detection',
  description:
    'Automatically detect subscriptions, money leaks, and unusual spending with trained ML models — real applied machine learning, not LLM prompts.',
  keywords: ['ledgerline', 'fintech', 'subscription detection', 'anomaly detection', 'machine learning', 'expense tracking'],
  openGraph: {
    title: 'LedgerLine',
    description: 'Smart subscription & anomaly detection powered by real ML models',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} style={{ background: '#FAF9F6' }}>
      <body style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#FAF9F6' }}>
        {children}
      </body>
    </html>
  );
}
