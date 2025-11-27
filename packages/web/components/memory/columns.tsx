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

const renderPlaceholder = () => <span className="text-xs text-muted-foreground">—</span>;

const formatReadableLabel = (value: string) => {
  const normalized = value.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

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
    size: 140,
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
        <div className="text-xs leading-tight w-32 min-w-[120px]">
          <div className="font-medium text-foreground/80">{date.toLocaleDateString()}</div>
          <div className="text-muted-foreground">{date.toLocaleTimeString()}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'category',
    header: () => <Trans>Category</Trans>,
    cell: ({ row }) => {
      const category = String(row.getValue('category') || '');
      const label = category ? formatReadableLabel(category) : t`Unknown`;
      return (
        <Badge variant="outline" className="text-muted-foreground text-xs px-2">
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'text',
    header: () => <Trans>Memory</Trans>,
    cell: ({ row, table }) => {
      const text = row.getValue('text') as string;
      const meta = table.options.meta as {
        onViewMemory?: (memory: Memory) => void;
      };

      return (
        <div className="max-w-[600px] py-2">
          <p
            className="text-sm leading-relaxed line-clamp-3 cursor-pointer hover:text-foreground/80 transition-colors"
            onClick={() => meta?.onViewMemory?.(row.original)}
            title={t`Click to view full content`}
          >
            {text}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: 'scope',
    header: () => <Trans>Scope</Trans>,
    cell: ({ row }) => {
      const scope = row.getValue('scope') as string | null;
      if (!scope) return renderPlaceholder();
      return (
        <Badge variant="outline" className="text-xs">
          {formatReadableLabel(scope)}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'importance',
    header: () => <Trans>Importance</Trans>,
    cell: ({ row }) => {
      const importance = row.getValue('importance') as number | null;
      if (importance === null || typeof importance === 'undefined') {
        return renderPlaceholder();
      }
      return <span className="text-sm font-medium">{importance}</span>;
    },
  },
  {
    accessorKey: 'summary',
    header: () => <Trans>Summary</Trans>,
    cell: ({ row, table }) => {
      const summary = row.getValue('summary') as string | null;
      if (!summary) return renderPlaceholder();
      const meta = table.options.meta as {
        onViewMemory?: (memory: Memory) => void;
      };
      return (
        <p
          className="text-sm text-muted-foreground max-w-[520px] line-clamp-3 cursor-pointer hover:text-foreground/80 transition-colors"
          onClick={() => meta?.onViewMemory?.(row.original)}
          title={t`Click to view full summary`}
        >
          {summary}
        </p>
      );
    },
  },
  {
    accessorKey: 'retention',
    header: () => <Trans>Retention</Trans>,
    cell: ({ row }) => {
      const retention = String(row.getValue('retention') || '');
      const label = retention ? formatReadableLabel(retention) : t`Unknown`;
      const variant = retention === 'permanent' ? 'default' : retention === 'short_term' ? 'secondary' : 'outline';
      return (
        <Badge variant={variant as 'default' | 'secondary' | 'outline'} className="text-xs w-fit">
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'retentionExpiresAt',
    size: 140,
    header: ({ column }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="-ml-4">
          <Trans>Expires</Trans>
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const expiration = row.getValue('retentionExpiresAt') as Date | null | undefined;
      if (!expiration) {
        return <div className="text-sm text-muted-foreground">-</div>;
      }
      return (
        <div className="text-xs leading-tight w-32 min-w-[120px]">
          <div className="font-medium text-foreground/80">{expiration.toLocaleDateString()}</div>
          <div className="text-muted-foreground">{expiration.toLocaleTimeString()}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'keywords',
    header: () => <Trans>Keywords</Trans>,
    cell: ({ row }) => {
      const keywords = (row.getValue('keywords') as string[] | null) ?? [];
      if (!keywords.length) return renderPlaceholder();
      return (
        <div className="flex flex-wrap gap-1 max-w-[260px]">
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="text-xs">
              {keyword}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'entities',
    header: () => <Trans>Entities</Trans>,
    cell: ({ row }) => {
      const entities =
        (row.getValue('entities') as Array<{
          label: string;
          value: string;
        }> | null) ?? [];
      if (!entities.length) return renderPlaceholder();
      return (
        <div className="flex flex-wrap gap-1 max-w-[320px]">
          {entities.map((entity) => {
            const key = `${entity.label}-${entity.value}`;
            return (
              <Badge key={key} variant="secondary" className="text-xs">
                {entity.label}: {entity.value}
              </Badge>
            );
          })}
        </div>
      );
    },
  },
  {
    accessorKey: 'partnerId',
    header: () => <Trans>Partner ID</Trans>,
    cell: ({ row }) => {
      const partnerId = row.getValue('partnerId') as string | null;
      if (!partnerId) return renderPlaceholder();
      return <code className="text-xs">{partnerId}</code>;
    },
  },
  {
    accessorKey: 'conversationId',
    header: () => <Trans>Conversation ID</Trans>,
    cell: ({ row }) => {
      const conversationId = row.getValue('conversationId') as string | null;
      if (!conversationId) return renderPlaceholder();
      return <code className="text-xs">{conversationId}</code>;
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const memory = row.original;

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
                navigator.clipboard.writeText(memory.text);
                toast.success(t`Memory copied to clipboard`);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              <Trans>Copy</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(memory)}>
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
