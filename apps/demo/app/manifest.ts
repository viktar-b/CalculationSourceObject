import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CalculationSourceObject',
    short_name: 'CSO',
    description:
      'Constrained Python, CalculationSourceObject and reviewable FormulaSheet documents. Source-to-document consistency, independent numerical references and visual inspection are separate checks.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f5f1',
    theme_color: '#171f28',
    icons: [
      {
        src: '/icons/cso-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/cso-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/cso-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
