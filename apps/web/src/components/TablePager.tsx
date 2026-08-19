'use client';

import { useEffect, useMemo, useState } from 'react';

export const TABLE_PAGE_SIZE = 10;

export function usePaged<T>(
  items: T[],
  resetKey?: string | number,
  size = TABLE_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const key = `${resetKey ?? ''}:${items.length}:${size}`;

  useEffect(() => {
    setPage(1);
  }, [key]);

  return useMemo(() => {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / size) || 1);
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * size;
    return {
      slice: items.slice(start, start + size),
      page: current,
      setPage,
      pages,
      total,
      size,
      from: total ? start + 1 : 0,
      to: Math.min(start + size, total),
    };
  }, [items, page, size]);
}

export function TablePager({
  page,
  pages,
  total,
  size,
  from,
  to,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
}) {
  if (total <= size) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-mist pt-3 text-xs text-navy/55">
      <p className="tabular-nums">
        عرض {from}–{to} من {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-ghost !px-2.5 !py-1 text-xs disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          السابق
        </button>
        <span className="min-w-[3.5rem] text-center font-bold tabular-nums text-navy">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn-ghost !px-2.5 !py-1 text-xs disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          التالي
        </button>
      </div>
    </div>
  );
}
