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
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  globalFilter?: string;
  pageSize?: number;
};

export function DataTable<TData>({
  columns,
  data,
  emptyDescription = "Ajuste os filtros ou cadastre novos registros.",
  emptyTitle = "Nenhum registro encontrado",
  globalFilter,
  pageSize = 10,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    state: { globalFilter, sorting },
  });
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const paginationLabel = useMemo(() => {
    const state = table.getState().pagination;
    const from = rows.length ? state.pageIndex * state.pageSize + 1 : 0;
    const to = state.pageIndex * state.pageSize + rows.length;
    return `${from}-${to} de ${data.length}`;
  }, [data.length, rows.length, table]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="overflow-x-auto">
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
      {!rows.length ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      <div className="flex flex-col gap-3 px-4 py-4 text-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{paginationLabel}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Anterior
          </Button>
          <span className="tabular-nums">
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(pageCount, 1)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
