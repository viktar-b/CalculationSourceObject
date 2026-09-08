import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { PreparedFormulaSheet } from '@viktar-b/cso-react';
import type { PreparedDocument } from '@viktar-b/cso-core';
import type { PresentationMapping } from './evidence.ts';

export async function renderPreparedPdf(
  preparedDocument: PreparedDocument,
): Promise<{ pdf: Buffer; presentation: PresentationMapping[] }> {
  const css = readFileSync(
    createRequire(import.meta.url).resolve('@viktar-b/cso-react/style.css'),
    'utf8',
  );
  const markup = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document: preparedDocument }),
  );
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    const requests: string[] = [];
    await page.route('**/*', (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    // Parse SVG as inert XML before decoding or inserting any image.
    await page.evaluate((assets) => {
      for (const resolved of assets) {
        if (resolved.asset.mediaType !== 'image/svg+xml') continue;
        const xml = new TextDecoder('utf-8', { fatal: true }).decode(
          Uint8Array.from(atob(resolved.dataUrl.split(',')[1]), (c) =>
            c.charCodeAt(0),
          ),
        );
        const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
        if (
          parsed.querySelector('parsererror') ||
          parsed.documentElement.localName !== 'svg' ||
          parsed.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg'
        )
          throw new Error('Invalid SVG XML');
        const forbidden = new Set([
          'script',
          'foreignobject',
          'iframe',
          'object',
          'embed',
          'audio',
          'video',
          'a',
          'animate',
          'animatetransform',
          'animatemotion',
          'discard',
          'set',
          'style',
        ]);
        for (const element of parsed.querySelectorAll('*')) {
          if (
            element.namespaceURI !== 'http://www.w3.org/2000/svg' ||
            forbidden.has(element.localName.toLowerCase())
          )
            throw new Error(`Active SVG element ${element.localName}`);
          for (const attr of element.attributes) {
            const name = attr.localName.toLowerCase();
            // Reject styles instead of attempting to sanitize CSS escape syntax.
            if (
              name.startsWith('on') ||
              name === 'style' ||
              name === 'base' ||
              ((name === 'href' || name === 'src') &&
                !/^#[^\s]*$/.test(attr.value)) ||
              (/url\s*\(/i.test(attr.value) &&
                !/^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/.test(attr.value))
            )
              throw new Error(`Active or external SVG attribute ${attr.name}`);
          }
        }
      }
    }, preparedDocument.assets);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>${css}</style></head><body class="formula-sheet-printing"><div data-formula-sheet-print-root="true">${markup}</div></body></html>`;
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([
            document.fonts.ready,
            ...Array.from(document.images, async (image) => {
              await image.decode();
              if (!image.naturalWidth || !image.naturalHeight)
                throw new Error('Image decoded without dimensions');
            }),
          ]),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Image/font readiness timed out')),
              15_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    });
    if (requests.length)
      throw new Error(
        `Document attempted external requests: ${requests.join(', ')}`,
      );
    const presentation = await page.evaluate(
      (prepared): PresentationMapping[] => {
        const mappings: PresentationMapping[] = [
          { pointer: '/title', role: 'document title', selector: 'h1' },
        ];
        const placements = Array.from(
          document.querySelectorAll<HTMLElement>('[data-source-placement]'),
        );
        for (const [sectionIndex, section] of prepared.sections.entries()) {
          const pointer = `/sections/${sectionIndex}`;
          const heading = placements.find(
            (element) =>
              element.dataset.sourcePlacement === section.sourcePlacementId,
          );
          if (!heading || heading.textContent !== section.title)
            throw new Error(`Missing section ${section.id}`);
          const selector = `[data-source-placement=${JSON.stringify(section.sourcePlacementId)}]`;
          mappings.push({
            pointer: `${pointer}/title`,
            role: 'section title',
            selector,
          });
          for (const [itemIndex, item] of section.items.entries()) {
            const element = placements.find(
              (element) =>
                element.dataset.sourcePlacement === item.sourcePlacementId,
            );
            if (!element)
              throw new Error(
                `Missing ordered placement ${item.sourcePlacementId}`,
              );
            const itemPointer = `${pointer}/items/${itemIndex}`;
            const itemSelector = `[data-source-placement=${JSON.stringify(item.sourcePlacementId)}]`;
            switch (item.kind) {
              case 'text':
                if (!element.textContent?.includes(item.text ?? ''))
                  throw new Error('Missing authored text');
                mappings.push({
                  pointer: `${itemPointer}/text/content`,
                  role: 'authored text',
                  selector: itemSelector,
                });
                break;
              case 'figure':
                if (
                  element.querySelector('img')?.alt !== item.figure?.alt ||
                  element.dataset.assetSha256 !==
                    prepared.assets.find(
                      (asset) => asset.id === item.figure?.assetId,
                    )?.sha256
                )
                  throw new Error('Figure identity mismatch');
                mappings.push({
                  pointer: `${itemPointer}/figure`,
                  role: 'figure with caption and alt text',
                  selector: itemSelector,
                });
                break;
              case 'symbol':
              case 'symbolRef':
                if (!element.querySelector('math'))
                  throw new Error('Missing mathematical notation');
                mappings.push({
                  pointer:
                    item.kind === 'symbol'
                      ? `${itemPointer}/symbol`
                      : `${itemPointer}/id`,
                  role: 'engineering row projection: glyph, description, units, active formula, substitution, result and comment; internal fields remain evidence',
                  selector: itemSelector,
                });
                break;
              case 'section':
                break;
            }
          }
        }
        for (const element of document.querySelectorAll<HTMLElement>(
          '[data-engineering-value]',
        )) {
          const pointer = element.dataset.engineeringValue;
          if (pointer)
            mappings.push({
              pointer,
              role: 'selected engineering context',
              selector: `[data-engineering-value=${JSON.stringify(pointer)}]`,
            });
        }
        for (const math of document.querySelectorAll('math')) {
          const cell = math.closest('td') ?? math.parentElement;
          if (
            cell &&
            math.getBoundingClientRect().width >
              cell.getBoundingClientRect().width + 2
          )
            throw new Error('Mathematical notation overflows its cell');
        }
        if (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 2
        )
          throw new Error('Document exceeds page width');
        return mappings;
      },
      {
        sections: preparedDocument.sections.map((section) => ({
          id: section.id,
          title: section.title,
          sourcePlacementId: section.sourcePlacementId,
          items: section.items.map((item) => ({
            kind: item.kind,
            sourcePlacementId: item.sourcePlacementId,
            text: item.kind === 'text' ? item.text.content : undefined,
            figure: item.kind === 'figure' ? item.figure : undefined,
          })),
        })),
        assets: preparedDocument.assets.map(({ asset }) => asset),
      },
    );
    let printTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pdf = await Promise.race([
        page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        }),
        new Promise<never>((_, reject) => {
          printTimer = setTimeout(
            () => reject(new Error('PDF printing timed out')),
            30_000,
          );
        }),
      ]);
      return { pdf, presentation };
    } finally {
      clearTimeout(printTimer);
    }
  } finally {
    await browser.close();
  }
}
