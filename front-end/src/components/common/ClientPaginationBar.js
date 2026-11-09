import React from 'react';
import './ClientPaginationBar.css';

/**
 * Client-side list footer: page size, prev/next, range summary.
 */
export default function ClientPaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = '',
}) {
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);

  return (
    <div
      className={`client-pagination-bar ${className}`.trim()}
      role="navigation"
      aria-label="Table pagination"
    >
      <span className="client-pagination-bar__meta">
        {totalItems === 0
          ? 'No entries'
          : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </span>
      <div className="client-pagination-bar__controls">
        {onPageSizeChange && (
          <label className="client-pagination-bar__size">
            <span className="client-pagination-bar__size-label">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="client-pagination-bar__btn"
          disabled={safePage <= 1 || totalItems === 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        <span className="client-pagination-bar__page">
          Page {totalItems === 0 ? 0 : safePage} of {totalItems === 0 ? 0 : totalPages}
        </span>
        <button
          type="button"
          className="client-pagination-bar__btn"
          disabled={safePage >= totalPages || totalItems === 0}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
