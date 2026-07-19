"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  CaretDown as ChevronDown,
  CaretUpDown as ChevronsUpDown,
  CaretUp as ChevronUp,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

export type DataTableColumnMeta = {
  align?: "left" | "center" | "right";
};

const alignClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

function columnAlignment<TData>(column: ColumnDef<TData>) {
  const meta = column.meta as DataTableColumnMeta | undefined;
  return alignClasses[meta?.align ?? "left"];
}

type DataTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyDescription?: string;
  emptyTitle?: string;
  enableSorting?: boolean;
  globalFilter?: string;
  /** Mostra linhas skeleton enquanto os dados chegam (sem dados ainda). */
  loading?: boolean;
  pageSize?: number;
  renderMobileRow?: (row: TData) => React.ReactNode;
  /** Renderiza um campo de busca embutido ligado ao filtro global. */
  searchable?: boolean;
  searchPlaceholder?: string;
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    pending?: boolean;
    onPageChange: (page: number) => void;
  };
};

export function DataTable<TData>({
  columns,
  data,
  emptyDescription = "Ajuste os filtros ou cadastre novos registros.",
  emptyTitle = "Nenhum registro encontrado",
  enableSorting = true,
  globalFilter,
  loading,
  pageSize = 10,
  renderMobileRow,
  searchable,
  searchPlaceholder = "Buscar...",
  serverPagination,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalFilter, setInternalFilter] = useState("");
  const effectiveFilter = searchable ? internalFilter : globalFilter;
  const showLoadingState = Boolean(loading) && !data.length;
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    enableSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    state: { globalFilter: effectiveFilter, sorting },
  });
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const paginationLabel = useMemo(() => {
    if (serverPagination) {
      const from = rows.length
        ? (serverPagination.page - 1) * serverPagination.pageSize + 1
        : 0;
      const to = rows.length
        ? Math.min(
            serverPagination.page * serverPagination.pageSize,
            serverPagination.total,
          )
        : 0;
      return `${from}-${to} de ${serverPagination.total}`;
    }

    const state = table.getState().pagination;
    const from = rows.length ? state.pageIndex * state.pageSize + 1 : 0;
    const to = state.pageIndex * state.pageSize + rows.length;
    return `${from}-${to} de ${data.length}`;
  }, [data.length, rows.length, serverPagination, table]);
  const currentPage =
    serverPagination?.page ?? table.getState().pagination.pageIndex + 1;
  const totalPages = serverPagination
    ? Math.max(Math.ceil(serverPagination.total / serverPagination.pageSize), 1)
    : Math.max(pageCount, 1);
  const canPrevious = serverPagination
    ? serverPagination.page > 1
    : table.getCanPreviousPage();
  const canNext = serverPagination
    ? serverPagination.page < totalPages
    : table.getCanNextPage();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
      {searchable ? (
        <div className="border-b border-border px-4 py-3">
          <div className="relative max-w-xs">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={internalFilter}
              onChange={(event) => setInternalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 pl-9"
            />
          </div>
        </div>
      ) : null}
      <div
        className={cn("overflow-x-auto", renderMobileRow && "hidden md:block")}
      >
        <table className="w-full min-w-[760px] border-collapse text-body tabular-nums">
          <thead className="bg-muted/50 text-left text-label tracking-wide uppercase text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "border-b border-border px-4 py-3 font-medium",
                      columnAlignment(header.column.columnDef),
                    )}
                    style={
                      header.column.columnDef.size !== undefined
                        ? { width: header.getSize() }
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 text-left",
                          header.column.getCanSort()
                            ? "cursor-pointer hover:text-foreground"
                            : "cursor-default",
                        )}
                        disabled={!header.column.getCanSort()}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getCanSort() ? (
                          header.column.getIsSorted() === "asc" ? (
                            <ChevronUp className="size-3.5" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-60" />
                          )
                        ) : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {showLoadingState
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`}>
                    {table.getAllLeafColumns().map((column) => (
                      <td
                        key={column.id}
                        className="border-b border-border px-4 py-3"
                      >
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-background"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "border-b border-border px-4 py-3",
                      columnAlignment(cell.column.columnDef),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderMobileRow && showLoadingState ? (
        <div className="divide-y divide-border md:hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`mobile-skeleton-${index}`} className="grid gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}
      {renderMobileRow && rows.length ? (
        <div className="divide-y divide-border md:hidden">
          {rows.map((row) => (
            <div key={row.id} className="p-4">
              {renderMobileRow(row.original)}
            </div>
          ))}
        </div>
      ) : null}
      {!rows.length && !showLoadingState ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      <div className="flex flex-col gap-3 px-4 py-4 text-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{paginationLabel}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canPrevious || serverPagination?.pending}
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page - 1)
                : table.previousPage()
            }
          >
            Anterior
          </Button>
          <span className="tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canNext || serverPagination?.pending}
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page + 1)
                : table.nextPage()
            }
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
