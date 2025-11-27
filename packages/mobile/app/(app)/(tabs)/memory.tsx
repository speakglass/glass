import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/contexts/api-context';
import type { Memory } from '@glass/shared';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
  const lower = category.toLowerCase();
  if (lower.includes('personal') || lower.includes('about')) return 'person-outline';
  if (lower.includes('preference') || lower.includes('like')) return 'heart-outline';
  if (lower.includes('goal') || lower.includes('plan')) return 'flag-outline';
  if (lower.includes('work') || lower.includes('job')) return 'briefcase-outline';
  if (lower.includes('hobby') || lower.includes('interest')) return 'sparkles-outline';
  if (lower.includes('family') || lower.includes('friend')) return 'people-outline';
  if (lower.includes('location') || lower.includes('place')) return 'location-outline';
  if (lower.includes('language') || lower.includes('learning')) return 'book-outline';
  return 'bulb-outline';
};

const formatCategory = (category: string) => {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export default function MemoryScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [memoryText, setMemoryText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['memories'],
    queryFn: () => api.fetchMemories({ limit: 100 }),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredMemories = data?.items?.filter(
    (item) =>
      item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group memories by category
  const groupedMemories = filteredMemories?.reduce((acc, memory) => {
    const category = formatCategory(memory.category);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(memory);
    return acc;
  }, {} as Record<string, Memory[]>);

  const sortedCategories = Object.keys(groupedMemories || {}).sort();

  const handleDeleteMemory = useCallback(
    (memory: Memory) => {
      Alert.alert('Delete Memory', 'Are you sure you want to delete this memory?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMemory(memory.id);
              await refetch();
            } catch (err) {
              Alert.alert('Unable to delete memory', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ]);
    },
    [api, refetch]
  );

  const handleEditMemory = useCallback((memory: Memory) => {
    setEditingMemory(memory);
    setMemoryText(memory.text);
    setModalVisible(true);
  }, []);

  const handleAddMemory = useCallback(() => {
    setEditingMemory(null);
    setMemoryText('');
    setModalVisible(true);
  }, []);

  const handleSaveMemory = async () => {
    const trimmedText = memoryText.trim();
    if (!trimmedText) {
      Alert.alert('Empty Memory', 'Please enter some text for the memory.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingMemory) {
        await api.updateMemory(editingMemory.id, { value: trimmedText });
      } else {
        await api.createMemories([{ value: trimmedText }]);
      }
      await queryClient.invalidateQueries({ queryKey: ['memories'] });
      setModalVisible(false);
      setMemoryText('');
      setEditingMemory(null);
    } catch (err) {
      Alert.alert(
        editingMemory ? 'Unable to update memory' : 'Unable to add memory',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderRightActions = useCallback(
    (memory: Memory) => {
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={() => handleDeleteMemory(memory)}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
        </TouchableOpacity>
      );
    },
    [handleDeleteMemory]
  );

  const renderMemory = ({ item, index, category }: { item: Memory; index: number; category: string }) => {
    const categoryMemories = groupedMemories?.[category] || [];
    const isLast = index === categoryMemories.length - 1;

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => handleEditMemory(item)}>
          <View style={styles.listItem}>
            <View style={styles.iconContainer}>
              <Ionicons name={getCategoryIcon(item.category)} size={20} color="#666" />
            </View>
            <View style={styles.memoryInfo}>
              <Text style={styles.memoryText} numberOfLines={2}>
                {item.text}
              </Text>
              <View style={styles.memoryMeta}>
                {item.importance && item.importance >= 8 && (
                  <View style={styles.importanceBadge}>
                    <Text style={styles.importanceBadgeText}>Important</Text>
                  </View>
                )}
                <View style={styles.retentionBadge}>
                  <Text style={styles.retentionBadgeText}>{item.retention}</Text>
                </View>
                {item.createdAt && (
                  <Text style={styles.dateText}>
                    {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(item.createdAt)}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
          </View>
        </TouchableOpacity>
        {!isLast && <View style={styles.separator} />}
      </Swipeable>
    );
  };

  const renderCategory = ({ item: category }: { item: string }) => {
    const memories = groupedMemories?.[category] || [];

    return (
      <View style={styles.groupContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{category}</Text>
          <Text style={styles.sectionCount}>{memories.length}</Text>
        </View>
        <View style={styles.cardGroup}>
          {memories.map((memory, index) => (
            <View key={memory.id}>{renderMemory({ item: memory, index, category })}</View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Memory</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Failed to load memories</Text>
          </View>
        ) : (
          <FlatList
            data={sortedCategories}
            renderItem={renderCategory}
            keyExtractor={(item) => item}
            contentContainerStyle={!sortedCategories || sortedCategories.length === 0 ? styles.listEmpty : styles.list}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListHeaderComponent={
              <TouchableOpacity style={styles.addMemoryButton} onPress={handleAddMemory}>
                <View style={styles.addMemoryIconContainer}>
                  <Ionicons name="add-circle" size={24} color="#0052FF" />
                </View>
                <View style={styles.addMemoryInfo}>
                  <Text style={styles.addMemoryText}>Add Memory</Text>
                  <Text style={styles.addMemorySubtext}>Tell Glass something about yourself</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="bulb-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>{searchQuery ? 'No matching memories' : 'No memories yet'}</Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery ? 'Try a different search' : 'Add memories or Glass will remember things about you'}
                </Text>
              </View>
            }
          />
        )}

        {/* Edit/Add Memory Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{editingMemory ? 'Edit Memory' : 'Add Memory'}</Text>
                <TouchableOpacity onPress={handleSaveMemory} disabled={isSaving}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#0052FF" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <TextInput
                  style={styles.memoryInput}
                  placeholder="e.g., I love hiking and photography"
                  placeholderTextColor="#999"
                  value={memoryText}
                  onChangeText={setMemoryText}
                  multiline
                  autoFocus
                  maxLength={500}
                />
                <Text style={styles.charCount}>{memoryText.length}/500</Text>
              </View>

              <View style={styles.modalHint}>
                <Ionicons name="information-circle-outline" size={16} color="#666" />
                <Text style={styles.modalHintText}>
                  Glass uses memories to personalize conversations and provide relevant responses.
                </Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  list: {
    paddingBottom: 16,
  },
  listEmpty: {
    flexGrow: 1,
    padding: 16,
  },
  addMemoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#f8f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  addMemoryIconContainer: {
    marginRight: 12,
  },
  addMemoryInfo: {
    flex: 1,
  },
  addMemoryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0052FF',
    marginBottom: 2,
  },
  addMemorySubtext: {
    fontSize: 13,
    color: '#666',
  },
  groupContainer: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  sectionCount: {
    fontSize: 14,
    color: '#999',
  },
  cardGroup: {
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memoryInfo: {
    flex: 1,
  },
  memoryText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#000',
    marginBottom: 4,
  },
  memoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  importanceBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  importanceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d97706',
  },
  retentionBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  retentionBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginLeft: 64,
    marginRight: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  modalCancelText: {
    fontSize: 17,
    color: '#666',
  },
  modalSaveText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0052FF',
  },
  modalBody: {
    padding: 16,
  },
  memoryInput: {
    fontSize: 16,
    color: '#000',
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
  },
  modalHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    gap: 8,
  },
  modalHintText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
});
