import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/contexts/api-context';
import type { Memory } from '@glass/shared';
import { Ionicons } from '@expo/vector-icons';

export default function MemoryScreen() {
  const api = useApi();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const renderMemory = ({ item }: { item: Memory }) => (
    <View style={styles.memoryCard}>
      <View style={styles.memoryHeader}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
        {item.importance && (
          <View style={styles.importanceBadge}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.importanceText}>{item.importance}</Text>
          </View>
        )}
      </View>
      <Text style={styles.memoryText}>{item.text}</Text>
      {item.summary && item.summary !== item.text && <Text style={styles.memorySummary}>{item.summary}</Text>}
      <View style={styles.memoryFooter}>
        <Text style={styles.retentionText}>{item.retention}</Text>
        {item.createdAt && (
          <Text style={styles.dateText}>
            {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(item.createdAt)}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={require('@/assets/glass-ai.png')} style={styles.headerAvatar} />
        <Text style={styles.headerTitle}>Memory</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search memories..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <Ionicons
              name="close-circle"
              size={20}
              color="#999"
              style={styles.clearIcon}
              onPress={() => setSearchQuery('')}
            />
          )}
        </View>
      </View>

      {/* Recent Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent</Text>
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
          data={filteredMemories}
          renderItem={renderMemory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={!filteredMemories || filteredMemories.length === 0 ? styles.listEmpty : styles.list}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bulb-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>{searchQuery ? 'No matching memories' : 'No memories yet'}</Text>
              <Text style={styles.emptySubtext}>
                {searchQuery ? 'Try a different search' : 'Glass will remember important things about you'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  clearIcon: {
    marginLeft: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  list: {
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  memoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  memoryHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  categoryBadge: {
    backgroundColor: '#0052FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  importanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8DC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  importanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  memoryText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  memorySummary: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  memoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  retentionText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
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
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
