import { loadPreparedDocuments } from '../../src/examples/prepared-gallery.ts';
import { PreservationClient } from './PreservationClient.tsx';

export default function PreservationPage() {
  const documents = loadPreparedDocuments();
  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-2xl font-semibold">Document preservation cases</h1>
      <p className="my-3">
        Prepared documents supplied to this viewer. Numerical agreement and
        current human approval are not established by these development
        renderings.
      </p>
      <PreservationClient documents={documents} />
    </main>
  );
}
