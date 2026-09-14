import Link from 'next/link';
import { RoutePrefetcher } from './RoutePrefetcher.tsx';

type SiteNavItem = {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
};

export function SiteNav({
  active,
}: {
  readonly active: 'home' | 'docs' | 'examples' | 'ascii';
}) {
  const items: readonly SiteNavItem[] = [
    { href: '/', label: 'Concept', active: active === 'home' },
    { href: '/docs', label: 'Docs', active: active === 'docs' },
    { href: '/examples', label: 'Examples', active: active === 'examples' },
    { href: '/ascii', label: 'ASCII Review', active: active === 'ascii' },
  ];
  const activeHref = items.find((item) => item.active)?.href ?? '/';

  return (
    <nav className="border-b border-gray-300 bg-[#f6f5f1]">
      <RoutePrefetcher activeHref={activeHref} />
      <div className="mx-auto flex max-w-[1560px] flex-col gap-3 px-4 py-4 min-md:flex-row min-md:items-center min-md:justify-between min-md:px-8">
        <Link
          href="/"
          prefetch={true}
          aria-label="CalculationSourceObject home"
          className="group inline-flex items-center font-mono text-[14px] font-semibold text-gray-950 hover:text-gray-700"
        >
          <span>{'{ CalculationSourceObject }'}</span>
        </Link>
        <div className="grid grid-cols-2 border border-gray-300 bg-white min-sm:flex min-sm:w-fit">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-current={item.active ? 'page' : undefined}
              className={`border-r border-gray-300 px-4 py-3 text-center font-['Plus_Jakarta_Sans'] text-[12px] font-semibold uppercase tracking-[0.08em] last:border-r-0 max-sm:even:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b min-sm:py-2 ${
                item.active
                  ? 'bg-gray-950 text-white'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
