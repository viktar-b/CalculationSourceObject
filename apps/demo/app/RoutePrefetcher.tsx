'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const routeHrefs = ['/', '/docs', '/examples', '/ascii'] as const;

export function RoutePrefetcher({
  activeHref,
}: { readonly activeHref: string }) {
  const router = useRouter();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      for (const href of routeHrefs) {
        if (href !== activeHref) {
          router.prefetch(href);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeHref, router]);

  return null;
}
