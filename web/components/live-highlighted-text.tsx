'use client';

import { useMemo } from 'react';
import type { TTSWordSegment } from '@/contexts/glass-context';

interface LiveHighlightedTextProps {
  text: string;
  highlight?: {
    segments: TTSWordSegment[];
    activeIndex: number;
  } | null;
  className?: string;
}

export function LiveHighlightedText({ text, highlight, className }: LiveHighlightedTextProps) {
  const pieces = useMemo(() => {
    if (!highlight || !highlight.segments || highlight.segments.length === 0) {
      return [{ text, highlighted: false, key: 'full' }];
    }

    const spans: Array<{ text: string; highlighted: boolean; key: string }> = [];
    let cursor = 0;
    const contentLength = text.length;

    highlight.segments.forEach((segment, index) => {
      const safeStart = Math.max(0, Math.min(segment.char_start, contentLength));
      const safeEnd = Math.max(safeStart, Math.min(segment.char_end, contentLength));

      if (safeStart > cursor) {
        spans.push({ text: text.slice(cursor, safeStart), highlighted: false, key: `gap-${cursor}-${safeStart}` });
      }

      const sliceText = text.slice(safeStart, safeEnd) || segment.text;
      spans.push({
        text: sliceText,
        highlighted: highlight.activeIndex === index,
        key: `seg-${index}-${safeStart}`,
      });

      cursor = safeEnd;
    });

    if (cursor < contentLength) {
      spans.push({ text: text.slice(cursor), highlighted: false, key: `tail-${cursor}` });
    }

    return spans;
  }, [highlight, text]);

  return (
    <span className={className}>
      {pieces.map((piece) => (
        <span key={piece.key} className={piece.highlighted ? 'bg-primary/20 text-foreground rounded' : undefined}>
          {piece.text}
        </span>
      ))}
    </span>
  );
}
