import { loadExamples } from '../../src/examples/gallery.ts';
import { SiteNav } from '../SiteNav.tsx';
import { ExamplesClient } from './ExamplesClient.tsx';

export const dynamic = 'force-static';
export const revalidate = false;

export default function ExamplesPage() {
  const examples = loadExamples();

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-gray-950">
      <SiteNav active="examples" />
      <div className="mx-auto flex max-w-[1560px] flex-col gap-7 px-4 py-6 min-md:px-8 min-md:py-8">
        <header className="border-b border-gray-300 pb-6">
          <div>
            <h1 className="mt-3 font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight text-gray-950 min-md:text-[44px]">
              Examples
            </h1>
            <p className="mt-3 max-w-[760px] font-['Plus_Jakarta_Sans'] text-[14px] leading-6 text-gray-600">
              Review calculation inputs, formulas and results. Prepared
              documents include source assumptions, notation and diagrams.
            </p>
          </div>
        </header>

        <ExamplesClient examples={examples} />
      </div>
    </main>
  );
}
