import { chromium, type Page } from 'playwright';
import type { Diagnostic, PreparedDocument } from '@cs-object/core';
import type { PresentationMapping } from './evidence.ts';
import { buildPreparedHtml } from './prepared-html.ts';

export class LayoutInspectionError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
}

// Each page.evaluate callback must be self-contained in the browser realm.
function assertPassiveSvgAssetsInPage(
  assets: PreparedDocument['assets'],
): void {
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
}

async function waitForPrintAssetsInPage(): Promise<void> {
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
}

function presentationInput(preparedDocument: PreparedDocument) {
  return {
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
  };
}

function inspectPreparedPresentationInPage(
  prepared: ReturnType<typeof presentationInput>,
): PresentationMapping[] {
  const mappings: PresentationMapping[] = [
    { pointer: '/title', role: 'document title', selector: 'h1' },
  ];
  const placements = Array.from(
    document.querySelectorAll<HTMLElement>('[data-source-placement]'),
  );
  function mapItemPlacement(
    item: (typeof prepared.sections)[number]['items'][number],
    itemPointer: string,
  ): void {
    const element = placements.find(
      (element) => element.dataset.sourcePlacement === item.sourcePlacementId,
    );
    if (!element)
      throw new Error(`Missing ordered placement ${item.sourcePlacementId}`);
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
            prepared.assets.find((asset) => asset.id === item.figure?.assetId)
              ?.sha256
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
      mapItemPlacement(item, `${pointer}/items/${itemIndex}`);
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
  return mappings;
}

// Runs in the browser realm. Descendant bounds matter: an mfrac numerator can
// overflow while the outer math box and its immediate parent still fit.
function inspectLayoutInPage(media: 'screen' | 'print'): Diagnostic[] {
  const sheet = document.querySelector('[data-formula-sheet]');
  if (!sheet) throw new Error('Missing formula sheet');
  const sheetBounds = sheet.getBoundingClientRect();
  const findings = new Map<Element, Diagnostic>();
  for (const math of sheet.querySelectorAll('math')) {
    const placement = math.closest('[data-source-placement]');
    const row = math.closest('.cso-symbol-row') ?? sheet;
    const cell = math.closest('td') ?? row;
    const rowBounds = cell.getBoundingClientRect();
    let containerLeft = Math.max(sheetBounds.left, rowBounds.left);
    let containerRight = Math.min(sheetBounds.right, rowBounds.right);
    const parent = math.closest('td') ?? math.parentElement;
    const parentOverflow =
      parent &&
      math.getBoundingClientRect().width >
        parent.getBoundingClientRect().width + 2;
    if (parentOverflow && parent) {
      const parentBounds = parent.getBoundingClientRect();
      containerLeft = Math.max(containerLeft, parentBounds.left);
      containerRight = Math.min(containerRight, parentBounds.right);
    }
    for (const element of [math, ...math.querySelectorAll('*')]) {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const overflowPx = Math.max(
        containerLeft - bounds.left,
        bounds.right - containerRight,
        0,
      );
      if (overflowPx <= 2) continue;
      const sourcePlacementId =
        placement?.getAttribute('data-source-placement') ?? undefined;
      const selector = sourcePlacementId
        ? `[data-source-placement=${JSON.stringify(sourcePlacementId)}]`
        : '[data-formula-sheet]';
      const diagnostic: Diagnostic = {
        code: 'DOCUMENT_LAYOUT_OVERFLOW',
        stage: 'rendering',
        check: 'rendering',
        message: `Mathematical notation overflows its cell or sheet in ${media} layout: ${selector}, ${element.tagName}, ${overflowPx.toFixed(2)}px beyond content bounds.`,
        layout: {
          media,
          sourcePlacementId,
          selector,
          left: bounds.left,
          right: bounds.right,
          containerLeft,
          containerRight,
          overflowPx,
        },
      };
      const key = placement ?? row;
      const previous = findings.get(key);
      if (!previous || (previous.layout?.overflowPx ?? 0) < overflowPx)
        findings.set(key, diagnostic);
    }
  }
  if (
    findings.size === 0 &&
    document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 2
  ) {
    // Retain the coarse document guard for overflow outside mathematical rows.
    const right = document.documentElement.scrollWidth;
    const containerRight = document.documentElement.clientWidth;
    return [
      {
        code: 'DOCUMENT_LAYOUT_OVERFLOW',
        stage: 'rendering',
        check: 'rendering',
        message: `Document exceeds viewport width in ${media} layout.`,
        layout: {
          media,
          selector: 'html',
          left: 0,
          right,
          containerLeft: 0,
          containerRight,
          overflowPx: right - containerRight,
        },
      },
    ];
  }
  return [...findings.values()];
}

async function withPreparedPage<T>(
  document: PreparedDocument,
  html: string,
  usePage: (page: Page, presentation: PresentationMapping[]) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  const abort = () => {
    void browser.close().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    const requests: string[] = [];
    await page.route('**/*', (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    await page.evaluate(assertPassiveSvgAssetsInPage, document.assets);
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    const diagnostics: Diagnostic[] = [];
    for (const media of ['screen', 'print'] satisfies Array<
      'screen' | 'print'
    >) {
      await page.emulateMedia({ media });
      await page.evaluate(waitForPrintAssetsInPage);
      diagnostics.push(...(await page.evaluate(inspectLayoutInPage, media)));
    }
    if (requests.length)
      throw new Error(
        `Document attempted external requests: ${requests.join(', ')}`,
      );
    if (diagnostics.length) throw new LayoutInspectionError(diagnostics);
    const presentation = await page.evaluate(
      inspectPreparedPresentationInPage,
      presentationInput(document),
    );
    return await usePage(page, presentation);
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser.close();
  }
}

export function inspectPreparedHtml(
  document: PreparedDocument,
  html: string,
): Promise<PresentationMapping[]> {
  return withPreparedPage(
    document,
    html,
    async (_page, presentation) => presentation,
  );
}

export function renderPreparedPdf(
  document: PreparedDocument,
  html = buildPreparedHtml(document),
  signal?: AbortSignal,
): Promise<{ pdf: Buffer; presentation: PresentationMapping[] }> {
  return withPreparedPage(
    document,
    html,
    async (page, presentation) => {
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
    },
    signal,
  );
}
