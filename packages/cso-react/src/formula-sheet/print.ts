const DEFAULT_FORMULA_SHEET_SELECTOR = '[data-formula-sheet]';
const FORMULA_SHEET_PRINT_BODY_CLASS = 'formula-sheet-printing';
const FORMULA_SHEET_PRINT_ROOT_ATTRIBUTE = 'data-formula-sheet-print-root';
const PRINT_CLEANUP_DELAY_MS = 1000;
const IMAGE_PREPARATION_TIMEOUT_MS = 15_000;

export interface FormulaSheetPrintOptions {
  readonly target?: string | HTMLElement;
  readonly title?: string;
  readonly onError?: (error: unknown) => void;
}

interface BrowserPrintGlobals {
  readonly document: Document;
  readonly window: Window;
}

const getBrowserPrintGlobals = (): BrowserPrintGlobals | undefined => {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof window.print !== 'function' ||
    !document.body
  ) {
    return undefined;
  }

  return { document, window };
};

const resolvePrintTarget = (
  document: Document,
  target: FormulaSheetPrintOptions['target'],
): HTMLElement | undefined => {
  if (typeof target === 'string') {
    return document.querySelector<HTMLElement>(target) ?? undefined;
  }

  return (
    target ??
    document.querySelector<HTMLElement>(DEFAULT_FORMULA_SHEET_SELECTOR) ??
    undefined
  );
};

export const printFormulaSheet = (
  options: FormulaSheetPrintOptions = {},
): boolean => {
  const browser = getBrowserPrintGlobals();

  if (!browser) {
    return false;
  }

  if (
    browser.document.querySelector(`[${FORMULA_SHEET_PRINT_ROOT_ATTRIBUTE}]`)
  ) {
    return false;
  }

  const target = resolvePrintTarget(browser.document, options.target);

  if (!target) {
    return false;
  }

  const printRoot = browser.document.createElement('div');
  const printClone = target.cloneNode(true) as HTMLElement;
  const originalTitle =
    options.title === undefined ? undefined : browser.document.title;
  let cleanedUp = false;
  let cleanupTimeout: number | undefined;
  let preparationTimeout: number | undefined;

  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;

    if (cleanupTimeout !== undefined) {
      browser.window.clearTimeout(cleanupTimeout);
    }
    if (preparationTimeout !== undefined) {
      browser.window.clearTimeout(preparationTimeout);
    }
    browser.window.removeEventListener('afterprint', cleanup);
    printRoot.remove();
    browser.document.body.classList.remove(FORMULA_SHEET_PRINT_BODY_CLASS);

    if (originalTitle !== undefined) {
      browser.document.title = originalTitle;
    }
  };

  printRoot.setAttribute(FORMULA_SHEET_PRINT_ROOT_ATTRIBUTE, 'true');
  printRoot.appendChild(printClone);
  browser.document.body.appendChild(printRoot);
  browser.document.body.classList.add(FORMULA_SHEET_PRINT_BODY_CLASS);

  if (options.title !== undefined) {
    browser.document.title = options.title;
  }

  browser.window.addEventListener('afterprint', cleanup, { once: true });
  const printReady = (): void => {
    if (cleanedUp) {
      return;
    }
    if (preparationTimeout !== undefined) {
      browser.window.clearTimeout(preparationTimeout);
    }
    cleanupTimeout = browser.window.setTimeout(cleanup, PRINT_CLEANUP_DELAY_MS);
    try {
      browser.window.print();
    } catch (error) {
      cleanup();
      throw error;
    }
  };
  const images = Array.from(printClone.querySelectorAll('img'));
  if (images.length === 0) {
    printReady();
  } else {
    const preparationFailed = (error: unknown): void => {
      if (cleanedUp) {
        return;
      }
      cleanup();
      options.onError?.(error);
    };
    preparationTimeout = browser.window.setTimeout(() => {
      preparationFailed(
        new Error('Image preparation timed out before printing.'),
      );
    }, IMAGE_PREPARATION_TIMEOUT_MS);
    void Promise.all(
      images.map((image) => Promise.resolve().then(() => image.decode())),
    ).then(() => {
      try {
        printReady();
      } catch (error) {
        options.onError?.(error);
      }
    }, preparationFailed);
  }

  return true;
};
