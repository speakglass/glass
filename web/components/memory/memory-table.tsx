'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { useAccountSession } from '@/contexts/account-session-context';
import { createColumns, Memory } from './columns';
import { DataTable } from './data-table';
import { fetchMemories, deleteMemory, updateMemory, createMemories } from '@/lib/account-api';
import { toast } from '@/utils/toast';
import { MemoryDialog } from './memory-dialog';
import { plural, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Info, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MEMORY_VISIBLE_LIMIT = 50;

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  text: false,
  importance: false,
  partnerId: false,
  conversationId: false,
};

export function MemoryTable() {
  const { token } = useAccountSession();
  const queryClient = useQueryClient();
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewingMemory, setViewingMemory] = useState<Memory | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);
  const [memoriesToDelete, setMemoriesToDelete] = useState<Memory[] | null>(null);
  const deleteToastIdRef = useRef<string | number | null>(null);
  const bulkDeleteToastIdRef = useRef<string | number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const searchQuery = debouncedSearch;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['memories', searchQuery],
    queryFn: async () => {
      if (!token) throw new Error('No access token');
      return await fetchMemories(token, searchQuery ? { search: searchQuery } : undefined);
    },
    enabled: !!token,
    placeholderData: (prevData) => prevData,
  });

  const deleteMutation = useMutation({
    mutationFn: async (memoryId: string) => {
      if (!token) throw new Error('No access token');
      await deleteMemory(token, memoryId);
    },
    onMutate: () => {
      deleteToastIdRef.current = toast.loading(t`Deleting memory...`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast.success(t`Memory deleted successfully`);
      setMemoryToDelete(null);
    },
    onError: (error) => {
      toast.error(t`Failed to delete memory: ${error.message}`);
    },
    onSettled: () => {
      if (deleteToastIdRef.current !== null) {
        toast.dismiss(deleteToastIdRef.current);
        deleteToastIdRef.current = null;
      }
    },
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: async (memoryIds: string[]) => {
      if (!token) throw new Error('No access token');
      const { bulkDeleteMemories } = await import('@/lib/account-api');
      return await bulkDeleteMemories(token, memoryIds);
    },
    onMutate: (memoryIds) => {
      bulkDeleteToastIdRef.current = toast.loading(t`Deleting ${memoryIds.length} selected memories...`);
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      if (result.failed && result.failed.length > 0) {
        toast.warning(
          t`Deleted ${result.deleted} memories, but ${result.failed.length} could not be removed. Please retry later.`
        );
      } else {
        toast.success(t`Deleted ${variables.length} memories`);
      }
      setMemoriesToDelete(null);
    },
    onError: (error) => {
      toast.error(t`Failed to delete memories: ${error.message}`);
    },
    onSettled: () => {
      if (bulkDeleteToastIdRef.current !== null) {
        toast.dismiss(bulkDeleteToastIdRef.current);
        bulkDeleteToastIdRef.current = null;
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { value: string }) => {
      if (!token) throw new Error('No access token');
      const result = await createMemories(token, [data]);
      return result[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast.success(t`Memory created successfully`);
      setDialogOpen(false);
      setIsCreating(false);
      setEditingMemory(null);
    },
    onError: (error) => {
      toast.error(t`Failed to create memory: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { value?: string } }) => {
      if (!token) throw new Error('No access token');
      return await updateMemory(token, id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast.success(t`Memory updated successfully`);
      setDialogOpen(false);
      setEditingMemory(null);
    },
    onError: (error) => {
      toast.error(t`Failed to update memory: ${error.message}`);
    },
  });

  const handleEdit = (memory: Memory) => {
    setEditingMemory(memory);
    setIsCreating(false);
    setDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingMemory(null);
    setIsCreating(true);
    setDialogOpen(true);
  };

  const handleViewMemory = (memory: Memory) => {
    setViewingMemory(memory);
    setViewDialogOpen(true);
  };

  const handleSaveMemory = (data: { value: string }) => {
    if (isCreating || !editingMemory) {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate({
        id: editingMemory.id,
        data,
      });
    }
  };

  const handleDelete = (memory: Memory) => {
    setMemoryToDelete(memory);
  };

  const handleBulkDelete = (memories: Memory[]) => {
    if (memories.length === 0) return;
    setMemoriesToDelete(memories);
  };

  const confirmSingleDelete = () => {
    if (!memoryToDelete) return;
    deleteMutation.mutate(memoryToDelete.id);
  };

  const confirmBulkDelete = () => {
    if (!memoriesToDelete?.length) return;
    bulkDeleteMutation.mutate(memoriesToDelete.map((m) => m.id));
  };

  const columns = createColumns(handleEdit, handleDelete);
  const isInitialLoad = isLoading && !data;
  const totalMemories = data?.total ?? 0;
  const totalSummaryMessage = searchQuery
    ? plural(totalMemories, {
        one: '# matching memory',
        other: '# matching memories',
      })
    : plural(totalMemories, {
        one: '# total memory',
        other: '# total memories',
      });

  if (isInitialLoad) {
    return (
      <div className="flex items-center justify-center p-8">
        <Trans>Loading memories...</Trans>
      </div>
    );
  }

  const visibleCount = data?.items.length ?? 0;
  const shouldShowLimitNotice = !searchQuery && visibleCount >= MEMORY_VISIBLE_LIMIT;
  const limitTooltipIcon = shouldShowLimitNotice ? (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Info className="h-4 w-4 cursor-help text-muted-foreground hover:text-foreground" />
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <p className="max-w-xs text-sm">
          <Trans>
            This table highlights the latest {MEMORY_VISIBLE_LIMIT} memories. Older ones stay archived, so use the
            search field whenever you want to surface something specific.
          </Trans>
        </p>
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <>
      <div className="mb-3 flex flex-col gap-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{totalSummaryMessage}</span>
        {shouldShowLimitNotice && (
          <div className="flex items-center gap-1">
            <Trans>Showing the latest {MEMORY_VISIBLE_LIMIT} memories</Trans>
            {limitTooltipIcon}
          </div>
        )}
      </div>

      <div className="relative">
        <DataTable
          columns={columns}
          data={data?.items || []}
          onBulkDelete={handleBulkDelete}
          onAddNew={handleAddNew}
          meta={{ onViewMemory: handleViewMemory }}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          defaultHiddenColumns={DEFAULT_COLUMN_VISIBILITY}
        />
        {isFetching && !isInitialLoad && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <MemoryDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingMemory(null);
          setIsCreating(false);
        }}
        onSave={handleSaveMemory}
        memory={editingMemory}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <MemoryDialog
        open={viewDialogOpen}
        onClose={() => {
          setViewDialogOpen(false);
          setViewingMemory(null);
        }}
        onSave={() => {}}
        memory={viewingMemory}
        readOnly
      />

      <AlertDialog
        open={!!memoryToDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setMemoryToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete memory?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>This will permanently remove the selected memory from your knowledge graph.</Trans>
            </AlertDialogDescription>
            {deleteMutation.isPending && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <Trans>Deleting...</Trans>
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSingleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trans>Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!memoriesToDelete}
        onOpenChange={(open) => {
          if (!open && !bulkDeleteMutation.isPending) {
            setMemoriesToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete selected memories?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t`This action will permanently delete ${
                memoriesToDelete?.length ?? 0
              } selected memories. This cannot be undone.`}
            </AlertDialogDescription>
            {bulkDeleteMutation.isPending && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <Trans>Deleting selected memories...</Trans>
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trans>Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
