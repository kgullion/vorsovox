export function segmentize<Span extends { start: number; end: number }>(
  spans: Iterable<Span>,
  pause = 1
) {
  const sorted = [...spans].sort((a, b) => {
    let comp = a.start - b.start;
    return comp === 0 ? a.end - b.end : comp;
  });

  let segments: Span[][] = [];
  let segment: Span[] = [];
  let end = 0;
  for (const span of sorted) {
    // if close to previous span, add to segment
    if (span.start <= end + pause) segment.push(span);
    else {
      // otherwise, end current segment and start a new one
      if (segment.length) segments.push(segment);
      segment = [span];
    }
    end = span.end;
  }
  // push final segment if needed
  if (segment.length > 0) segments.push(segment);
  return segments;
}
