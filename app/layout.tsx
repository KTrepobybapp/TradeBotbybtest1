export const metadata = {
  title: 'One-Click Trading Dashboard',
  description: 'Bybit UTA trading dashboard with one-click market orders',
};

import './globals.css';
import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </div>
      </body>
    </html>
  );
}