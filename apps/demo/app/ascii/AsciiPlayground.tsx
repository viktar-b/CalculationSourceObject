'use client';

import { AsciiMathView } from '@viktar-b/cso-react';
import { useState } from 'react';

export function AsciiPlayground() {
  const [playExpression, setPlayExpression] = useState('M_cr');

  return (
    <section className="border border-gray-300 bg-[#ebe7dd] px-4 py-3">
      <label
        htmlFor="ascii-play-input"
        className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500"
      >
        Play
      </label>
      <div className="mt-2 grid gap-3 min-lg:grid-cols-[440px_minmax(0,1fr)]">
        <input
          id="ascii-play-input"
          value={playExpression}
          onChange={(event) => setPlayExpression(event.target.value)}
          aria-label="ASCII variable input"
          spellCheck={false}
          className="h-[48px] w-full border border-gray-300 bg-white px-3 font-mono text-[14px] text-gray-950 outline-hidden transition-colors placeholder:text-gray-400 focus:border-gray-950"
          placeholder="M_cr"
        />

        <div className="flex h-[48px] min-w-0 items-center overflow-x-auto overflow-y-hidden border border-gray-300 bg-white px-3">
          <math className="text-[24px] text-gray-950">
            <AsciiMathView expression={playExpression} />
          </math>
        </div>
      </div>
    </section>
  );
}
