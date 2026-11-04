"use client";

import { Button } from "@/components/ui/button";

interface TablePaginationProps {
  page: number;
  totalCount: number;
  perPage: number;
  onPageChange: (page: number) => void;
  /** A fetch is in flight, so moving again would race it. */
  disabled?: boolean;
}

/** The footer under a list: how many records, which page, Previous and Next. */
export function TablePagination({
  page,
  totalCount,
  perPage,
  onPageChange,
  disabled = false,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  return (
    <div className="app__pagination">
      <span>
        {totalCount.toLocaleString()} {totalCount === 1 ? "record" : "records"}
      </span>
      <div className="app__pagination_controls">
        <span>
          Page {page} of {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || disabled}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || disabled}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
