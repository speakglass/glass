import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/contexts/api-context';
import { router, Href } from 'expo-router';
import type { ConversationSummary } from '@glass/shared';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Helper function to get flag image
const getFlagImage = (languageCode: string) => {
  const code = languageCode?.toLowerCase();
  switch (code) {
    case 'kr':
    case 'ko':
      return require('@/assets/kr.png');
    case 'es':
      return require('@/assets/es.png');
    case 'us':
    case 'en':
      return require('@/assets/us.png');
    case 'fr':
      return require('@/assets/fr.png');
    case 'ja':
      return require('@/assets/ja.png');
    default:
      return null;
  }
};

export default function HistoryScreen() {
  const api = useApi();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.fetchConversationSummaries({ limit: 50 }),
  });

  const conversations = data?.conversations ?? [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const handleDeleteCall = (conversation: ConversationSummary) => {
    const name = conversation.partner?.name || 'Glass AI';
    Alert.alert('Delete Call', `Are you sure you want to delete this call with ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteConversation(conversation.id);
            await refetch();
          } catch (err) {
            Alert.alert('Unable to delete call', err instanceof Error ? err.message : 'Please try again later.');
          }
        },
      },
    ]);
  };

  const renderRightActions = (conversation: ConversationSummary) => {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={() => handleDeleteCall(conversation)}>
        <Ionicons name="trash-outline" size={24} color="#fff" />
      </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Calls</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
            <Text style={styles.searchPlaceholder}>Search</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, conversations.length === 0 && styles.contentCentered]}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent</Text>
          </View>

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Failed to load calls</Text>
            </View>
          ) : conversations.length > 0 ? (
            <>
              {conversations.map((item, index) => (
                <Swipeable key={item.id} renderRightActions={() => renderRightActions(item)} overshootRight={false}>
                  <TouchableOpacity
                    style={styles.listItem}
                    onPress={() => router.push(`/(app)/conversation/${item.id}` as Href)}
                  >
                    <View style={styles.avatarContainer}>
                      {item.partner?.avatarUrl ? (
                        <Image source={{ uri: item.partner.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Ionicons name="person" size={24} color="#999" />
                        </View>
                      )}
                    </View>
                    <View style={styles.conversationInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.partnerName} numberOfLines={1}>
                          {item.partner?.name || 'Glass AI'}
                        </Text>
                        {item.nativeLang && getFlagImage(item.nativeLang) && (
                          <View style={styles.flagBadge}>
                            <Image source={getFlagImage(item.nativeLang)} style={styles.flagBadgeImage} />
                          </View>
                        )}
                      </View>
                      <View style={styles.conversationFooter}>
                        <Ionicons name="call" size={14} color="#666" style={styles.callIcon} />
                        <Text style={styles.subtitle}>{formatDuration(item.durationSeconds)}</Text>
                      </View>
                    </View>
                    <Text style={styles.time}>{item.startedAt ? formatDate(item.startedAt) : '—'}</Text>
                    <TouchableOpacity
                      style={styles.callButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push(`/(app)/conversation/${item.id}` as Href);
                      }}
                    >
                      <Ionicons name="information-circle-outline" size={24} color="#666" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                  {index < conversations.length - 1 && <View style={styles.separator} />}
                </Swipeable>
              ))}
            </>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="call-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No calls yet</Text>
            </View>
          )}
        </ScrollView>
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
  searchPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  conversationInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 6,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flexShrink: 1,
  },
  flagBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    marginLeft: 1,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  flagBadgeImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  badge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: '#f0f0f0',
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.3,
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  callIcon: {
    marginRight: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  time: {
    fontSize: 13,
    color: '#666',
    marginRight: 12,
  },
  callButton: {
    padding: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginLeft: 78,
    marginRight: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
  },
  contentCentered: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
});
