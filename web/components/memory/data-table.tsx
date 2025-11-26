'use client';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onBulkDelete?: (items: TData[]) => void;
  onAddNew?: () => void;
  meta?: any;
  footerNote?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  defaultHiddenColumns?: VisibilityState;
  headerContent?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onBulkDelete,
  onAddNew,
  meta,
  footerNote,
  searchValue,
  onSearchChange,
  defaultHiddenColumns,
  headerContent,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => ({
      ...(defaultHiddenColumns || {}),
    }));
  const [rowSelection, setRowSelection] = React.useState({});
  const [isMobile, setIsMobile] = React.useState(false);

  // Detect screen size for mobile/desktop differences
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    globalFilterFn: 'includesString',
    meta,
  });

  // Set initial page size based on screen size
  React.useEffect(() => {
    if (isMobile && table.getState().pagination.pageSize > 10) {
      table.setPageSize(8);
    }
  }, [isMobile, table]);

  const handleDeleteSelected = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    if (selectedRows.length === 0) {
      toast.error(t`No rows selected`);
      return;
    }
    if (onBulkDelete) {
      onBulkDelete(selectedRows.map((row) => row.original));
    } else {
      toast.info(t`Would delete ${selectedRows.length} memories`);
    }
  };

  const mobileDeleteButton = table.getFilteredSelectedRowModel().rows.length >
    0 && (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs text-destructive hover:text-destructive shrink-0 sm:hidden"
      onClick={handleDeleteSelected}
    >
      <Trash2 className="h-4 w-4" />
      <Trans>Delete</Trans> ({table.getFilteredSelectedRowModel().rows.length})
    </Button>
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header content with mobile delete button */}
      {headerContent && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex-1 min-w-0">{headerContent}</div>
          {mobileDeleteButton}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3 gap-0">
          <div className="flex flex-1 items-center gap-2">
            <Input
              placeholder={t`Search memories...`}
              value={
                typeof searchValue === 'string'
                  ? searchValue
                  : (table.getColumn('fact')?.getFilterValue() as string) ?? ''
              }
              onChange={(event) => {
                if (onSearchChange) {
                  onSearchChange(event.target.value);
                } else {
                  table.getColumn('fact')?.setFilterValue(event.target.value);
                }
              }}
              className="h-9 w-full sm:w-[250px] lg:w-[400px] sm:placeholder:text-base placeholder:text-sm"
            />
            {onAddNew && (
              <Button
                size="sm"
                className="h-9 lg:hidden shrink-0"
                onClick={onAddNew}
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">
                  <Trans>Add memory</Trans>
                </span>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {table.getFilteredSelectedRowModel().rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-destructive hover:text-destructive hidden sm:flex"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <Trans>Delete</Trans> (
                {table.getFilteredSelectedRowModel().rows.length})
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 hidden lg:flex"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="ml-2">
                    <Trans>Columns</Trans>
                  </span>
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {table
                  .getAllColumns()
                  .filter(
                    (column) =>
                      typeof column.accessorFn !== 'undefined' &&
                      column.getCanHide()
                  )
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
            {onAddNew && (
              <Button
                size="sm"
                className="h-9 hidden lg:flex"
                onClick={onAddNew}
              >
                <Plus className="h-4 w-4" />
                <span className="ml-2">
                  <Trans>Add memory</Trans>
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto rounded-lg border flex-1 min-h-0">
        <Table>
          <TableHeader className="bg-muted sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <Trans>No results.</Trans>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 sm:px-4 shrink-0">
        <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
          {footerNote ??
            t`${table.getFilteredSelectedRowModel().rows.length} of ${
              table.getFilteredRowModel().rows.length
            } rows selected`}
        </div>
        <div className="flex w-full sm:w-fit items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="rows-per-page"
              className="text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              <Trans>Rows per page</Trans>
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-16 sm:w-20" id="rows-per-page">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {(isMobile ? [5, 8, 10, 15] : [10, 20, 30, 40, 50]).map(
                  (pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-xs sm:text-sm font-medium whitespace-nowrap">
            {t`Page ${
              table.getState().pagination.pageIndex + 1
            } of ${table.getPageCount()}`}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">
                <Trans>Go to first page</Trans>
              </span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">
                <Trans>Go to previous page</Trans>
              </span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">
                <Trans>Go to next page</Trans>
              </span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">
                <Trans>Go to last page</Trans>
              </span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
