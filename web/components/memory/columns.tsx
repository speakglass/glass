'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreVertical, Copy, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Memory as MemoryType } from '@/lib/account-api';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';

export type Memory = MemoryType;

export const createColumns = (
  onEdit: (memory: Memory) => void,
  onDelete: (memory: Memory) => void
): ColumnDef<Memory>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <div className="flex items-center justify-center w-8">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t`Select all`}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center w-8">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t`Select row`}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="-ml-4">
          <Trans>Created at</Trans>
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date | null;
      if (!date) {
        return <div className="text-sm text-muted-foreground">-</div>;
      }
      return (
        <div className="text-sm w-40">
          <div>{date.toLocaleDateString()}</div>
          <div className="text-muted-foreground text-xs">{date.toLocaleTimeString()}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'label',
    header: () => <Trans>Category</Trans>,
    cell: ({ row }) => {
      const label = row.getValue('label') as string;
      return (
        <Badge variant="outline" className="text-muted-foreground text-xs px-2">
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'fact',
    header: () => <Trans>Memory</Trans>,
    cell: ({ row, table }) => {
      const fact = row.getValue('fact') as string;
      const meta = table.options.meta as { onViewMemory?: (memory: Memory) => void };

      return (
        <div className="max-w-[600px] py-2">
          <p
            className="text-sm leading-relaxed line-clamp-3 cursor-pointer hover:text-foreground/80 transition-colors"
            onClick={() => meta?.onViewMemory?.(row.original)}
            title={t`Click to view full content`}
          >
            {fact}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: () => <Trans>Status</Trans>,
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const statusConfig = {
        active: { label: t`Active`, variant: 'default' as const },
        expired: { label: t`Expired`, variant: 'secondary' as const },
        invalid: { label: t`Invalid`, variant: 'outline' as const },
      };
      const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;
      return (
        <Badge variant={config.variant} className="text-xs">
          {config.label}
        </Badge>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const memory = row.original;
      const isExpired = memory.status === 'expired';
      const disabledReason = isExpired ? t`Expired memories cannot be edited` : undefined;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
              size="icon"
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">
                <Trans>Open menu</Trans>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>
              <Trans>Actions</Trans>
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(memory.fact);
                toast.success(t`Memory copied to clipboard`);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              <Trans>Copy</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (isExpired) return;
                onEdit(memory);
              }}
              disabled={isExpired}
              title={disabledReason}
            >
              <Edit className="mr-2 h-4 w-4" />
              <Trans>Edit</Trans>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(memory)}>
              <Trash2 className="mr-2 h-4 w-4" />
              <Trans>Delete</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
