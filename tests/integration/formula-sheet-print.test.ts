import { printFormulaSheet } from '@cs-object/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

class FakeClassList {
  private readonly values = new Set<string>();

  add(value: string): void {
    this.values.add(value);
  }

  remove(value: string): void {
    this.values.delete(value);
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly tagName: string;
  parentElement: FakeElement | undefined;
  textContent = '';

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);

    return child;
  }

  cloneNode(deep = false): FakeElement {
    const clone = new FakeElement(this.tagName);
    clone.textContent = this.textContent;

    for (const [name, value] of this.attributes.entries()) {
      clone.setAttribute(name, value);
    }

    if (deep) {
      for (const child of this.children) {
        clone.appendChild(child.cloneNode(true));
      }
    }

    return clone;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(): never[] {
    return [];
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }

    const index = this.parentElement.children.indexOf(this);

    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }

    this.parentElement = undefined;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'window');
  vi.useRealTimers();
});

describe('printFormulaSheet', () => {
  test('returns false when browser printing is unavailable', () => {
    expect(printFormulaSheet()).toBe(false);
  });

  test('clones the sheet, prints it, and cleans up after print', () => {
    vi.useFakeTimers();

    const body = new FakeElement('body');
    const target = new FakeElement('article');
    target.setAttribute('data-formula-sheet', 'true');
    target.textContent = 'Calculation rows';

    const fakeDocument = {
      body,
      title: 'Before print',
      createElement: vi.fn((tagName: string) => new FakeElement(tagName)),
      querySelector: vi.fn((selector: string) =>
        selector === '[data-formula-sheet]' ? target : null,
      ),
    };
    let afterPrintHandler: (() => void) | undefined;
    const fakeWindow = {
      addEventListener: vi.fn(
        (_type: string, listener: EventListenerOrEventListenerObject) => {
          afterPrintHandler =
            typeof listener === 'function'
              ? () => listener(new Event('afterprint'))
              : () => listener.handleEvent(new Event('afterprint'));
        },
      ),
      clearTimeout: globalThis.clearTimeout,
      print: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: globalThis.setTimeout,
    };

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: fakeDocument,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: fakeWindow,
    });

    const didPrint = printFormulaSheet({ title: 'Selected calculation' });

    expect(didPrint).toBe(true);
    expect(fakeDocument.title).toBe('Selected calculation');
    expect(body.classList.contains('formula-sheet-printing')).toBe(true);
    expect(fakeWindow.print).toHaveBeenCalledTimes(1);
    expect(body.children).toHaveLength(1);

    const printRoot = body.children[0];

    expect(printRoot?.getAttribute('data-formula-sheet-print-root')).toBe(
      'true',
    );
    expect(printRoot?.children[0]).not.toBe(target);
    expect(printRoot?.children[0]?.textContent).toBe('Calculation rows');

    afterPrintHandler?.();

    expect(body.children).toEqual([]);
    expect(body.classList.contains('formula-sheet-printing')).toBe(false);
    expect(fakeDocument.title).toBe('Before print');

    vi.runAllTimers();

    expect(body.children).toEqual([]);
    expect(fakeDocument.title).toBe('Before print');
  });
});
