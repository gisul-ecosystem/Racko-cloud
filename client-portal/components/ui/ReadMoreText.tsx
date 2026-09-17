'use client';

import { useMemo, useState } from 'react';

interface ReadMoreTextProps {
  text: string;
  /** Character length before collapsing. Default 120. */
  previewLength?: number;
  className?: string;
  buttonClassName?: string;
}

export function ReadMoreText({
  text,
  previewLength = 120,
  className = 'text-xs text-red-600',
  buttonClassName = 'mt-0.5 text-xs font-medium text-[#B91C1C] hover:underline',
}: ReadMoreTextProps) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = String(text || '').trim();
  const needsToggle = trimmed.length > previewLength;

  const preview = useMemo(() => {
    if (!needsToggle || expanded) return trimmed;
    const slice = trimmed.slice(0, previewLength);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > previewLength * 0.6 ? slice.slice(0, lastSpace) : slice;
    return `${cut}…`;
  }, [expanded, needsToggle, previewLength, trimmed]);

  if (!trimmed) return null;

  return (
    <div className="max-w-[16rem] text-left">
      <p className={`whitespace-pre-wrap break-words ${className}`}>{preview}</p>
      {needsToggle ? (
        <button
          type="button"
          className={buttonClassName}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  );
}
