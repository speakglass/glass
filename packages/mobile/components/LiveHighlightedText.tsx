import { Text, StyleSheet, type TextStyle } from 'react-native';
import { useMemo } from 'react';
import type { TTSWordSegment } from '@/hooks/useVoiceCall';

interface LiveHighlightedTextProps {
  text: string;
  highlight?: {
    segments: TTSWordSegment[];
    activeIndex: number;
  } | null;
  style?: TextStyle | TextStyle[];
  highlightStyle?: TextStyle;
}

export function LiveHighlightedText({ text, highlight, style, highlightStyle }: LiveHighlightedTextProps) {
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

      // Add text before this segment
      if (safeStart > cursor) {
        spans.push({
          text: text.slice(cursor, safeStart),
          highlighted: false,
          key: `gap-${cursor}-${safeStart}`,
        });
      }

      // Add the segment itself
      const sliceText = text.slice(safeStart, safeEnd) || segment.text;
      spans.push({
        text: sliceText,
        highlighted: highlight.activeIndex === index,
        key: `seg-${index}-${safeStart}`,
      });

      cursor = safeEnd;
    });

    // Add remaining text
    if (cursor < contentLength) {
      spans.push({
        text: text.slice(cursor),
        highlighted: false,
        key: `tail-${cursor}`,
      });
    }

    return spans;
  }, [highlight, text]);

  return (
    <Text style={style}>
      {pieces.map((piece) => (
        <Text key={piece.key} style={[style, piece.highlighted && (highlightStyle || styles.defaultHighlight)]}>
          {piece.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  defaultHighlight: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)', // 부드러운 파란색 배경
    // React Native Text는 borderRadius를 지원하지 않으므로 제거
  },
});
