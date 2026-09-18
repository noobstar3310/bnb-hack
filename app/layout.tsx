import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { StoreProvider } from '@/lib/state/store';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Folio Lab — portfolio launchpad demo',
  description: 'Create a strategy. Explore portfolios. Try investing with simulated funds.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230e1729'/%3E%3Cpath d='M8 23V9h16M8 16h12' fill='none' stroke='%23c5fb60' stroke-width='4'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="m-0 bg-page text-ink">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
