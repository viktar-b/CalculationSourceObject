import type {
  PreparedContextField,
  PreparedContextValue,
} from '@viktar-b/cso-core';
import type { ReactElement } from 'react';
import { GlyphMathBlock } from './mathml/GlyphMathBlock.tsx';

const ContextValue = ({
  value,
}: { readonly value: PreparedContextValue }): ReactElement => {
  switch (value.kind) {
    case 'text':
      return (
        <span data-engineering-value={value.path}>{String(value.value)}</span>
      );
    case 'math':
      return (
        <span
          data-engineering-value={value.path}
          data-engineering-notation="math"
          data-engineering-source={value.value}
        >
          <GlyphMathBlock glyph={value.value} />
        </span>
      );
    case 'list':
      return (
        <ul>
          {value.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: prepared order identifies repeated entries
            <li key={index}>
              <ContextValue value={item} />
            </li>
          ))}
        </ul>
      );
    case 'record':
      return (
        <dl>
          {value.entries.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>
                <ContextValue value={entry.value} />
              </dd>
            </div>
          ))}
        </dl>
      );
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
};

export const EngineeringMetadata = ({
  entries,
  subject,
}: {
  readonly entries: readonly PreparedContextField[];
  readonly subject?: ReactElement;
}): ReactElement | null =>
  entries.length > 0 ? (
    <dl className="cso-engineering-context">
      {entries.map(({ label, path, value }) => (
        <div key={path} data-engineering-field={path}>
          <dt>
            {subject && <>{subject}: </>}
            {label}
          </dt>
          <dd>
            <ContextValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  ) : null;
