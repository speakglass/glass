'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccountSession } from '@/contexts/account-session-context';
import { createColumns, Memory } from './columns';
import { DataTable } from './data-table';
import { fetchMemories, deleteMemory, updateMemory, createMemories } from '@/lib/account-api';
import { toast } from 'sonner';
import { MemoryDialog } from './memory-dialog';

export function MemoryTable() {
  const { token } = useAccountSession();
  const queryClient = useQueryClient();
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewingMemory, setViewingMemory] = useState<Memory | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['memories'],
    queryFn: async () => {
      if (!token) throw new Error('No access token');
      return await fetchMemories(token);
    },
    enabled: !!token,
  });

  const deleteMutation = useMutation({
    mutationFn: async (memoryId: string) => {
      if (!token) throw new Error('No access token');
      await deleteMemory(token, memoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast.success('Memory deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete memory: ${error.message}`);
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
      toast.success('Memory created successfully');
      setDialogOpen(false);
      setIsCreating(false);
      setEditingMemory(null);
    },
    onError: (error) => {
      toast.error(`Failed to create memory: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { value?: string } }) => {
      if (!token) throw new Error('No access token');
      return await updateMemory(token, id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast.success('Memory updated successfully');
      setDialogOpen(false);
      setEditingMemory(null);
    },
    onError: (error) => {
      toast.error(`Failed to update memory: ${error.message}`);
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
    if (confirm(`Are you sure you want to delete this memory?`)) {
      deleteMutation.mutate(memory.id);
    }
  };

  const handleArchive = (memory: Memory) => {
    const newStatus = memory.status === 'archived' ? 'active' : 'archived';

    updateMutation.mutate({
      id: memory.id,
      data: { status: newStatus },
    });
  };

  const handleBulkDelete = async (memories: Memory[]) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete ${memories.length} memories?`)) return;

    try {
      const { bulkDeleteMemories } = await import('@/lib/account-api');
      await bulkDeleteMemories(
        token,
        memories.map((m) => m.id)
      );
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast.success(`Deleted ${memories.length} memories`);
    } catch (error: any) {
      toast.error(`Failed to delete memories: ${error.message}`);
    }
  };

  const columns = createColumns(handleEdit, handleDelete, handleArchive);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading memories...</div>;
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.items || []}
        onBulkDelete={handleBulkDelete}
        onAddNew={handleAddNew}
        totalCount={data?.total || 0}
        meta={{ onViewMemory: handleViewMemory }}
      />

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
    </>
  );
}
