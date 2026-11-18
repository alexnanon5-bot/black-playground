'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const RESULT_CHUNK_SIZE = 32_000;

function nextChunkEnd(value, start) {
  const limit = Math.min(start + RESULT_CHUNK_SIZE, value.length);
  if (limit === value.length) return limit;

  const newline = value.lastIndexOf('\n', limit - 1);
  if (newline >= limit - 4_000) return newline + 1;

  const lastCodeUnit = value.charCodeAt(limit - 1);
  return lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? limit - 1 : limit;
}

export default function LargeResult({ value }) {
  const viewport = useRef(null);
  const more = useRef(null);
  const [ends, setEnds] = useState(() => [nextChunkEnd(value, 0)]);
  const loaded = ends.at(-1);
  const loadMore = useCallback(() => {
    setEnds((previous) => previous.at(-1) === loaded && loaded < value.length
      ? [...previous, nextChunkEnd(value, loaded)]
      : previous);
  }, [loaded, value]);

  useEffect(() => {
    if (!more.current || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { root: viewport.current, rootMargin: '0px 0px 480px 0px' });
    observer.observe(more.current);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <section
      ref={viewport}
      tabIndex={0}
      aria-label="格式化结果"
      className="absolute inset-0 overflow-auto bg-slate-900 p-3 text-white [overflow-anchor:none]"
    >
      {ends.map((end, index) => (
        <pre key={end} className="whitespace-pre-wrap font-mono text-sm [overflow-wrap:anywhere]">
          {value.slice(ends[index - 1] ?? 0, end)}
        </pre>
      ))}
      {loaded < value.length && (
        <button
          ref={more}
          type="button"
          className="mt-2 text-sm underline"
          onClick={loadMore}
        >
          加载更多结果
        </button>
      )}
    </section>
  );
}
