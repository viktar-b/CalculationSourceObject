import { loadPreparedDocuments } from '../../src/examples/prepared-gallery.ts';
import { SiteNav } from '../SiteNav.tsx';
import { PreservationClient } from './PreservationClient.tsx';

export default function PreservationPage() {
  const documents = loadPreparedDocuments();
  return (
    <main className="min-h-screen bg-[#f6f5f1] text-gray-950">
      <SiteNav active="preservation" />
      <div className="mx-auto flex max-w-[1560px] flex-col gap-7 px-4 py-6 min-md:px-8 min-md:py-8">
        <header className="border-b border-gray-300 pb-6">
          <h1 className="mt-3 font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight min-md:text-[44px]">
            Document preservation cases
          </h1>
          <p className="mt-3 max-w-[760px] font-['Plus_Jakarta_Sans'] text-[14px] leading-6 text-gray-600">
            Prepared documents supplied to this viewer. The workspace launcher
            defaults to synthetic protocol and pagination fixtures. These are
            development renderings; they establish no numerical agreement or
            current human engineering approval. Browser printing does not
            produce a verified CLI PDF and evidence bundle.
          </p>
        </header>
        <PreservationClient documents={documents} />
      </div>
    </main>
  );
}
