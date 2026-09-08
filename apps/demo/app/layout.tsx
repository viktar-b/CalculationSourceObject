import '@viktar-b/cso-react/style.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import type { ReactNode } from 'react';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'CalculationSourceObject',
  description:
    'Constrained Python, CalculationSourceObject and reviewable FormulaSheet documents. Source-to-document consistency, independent numerical references and visual inspection are separate checks.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
