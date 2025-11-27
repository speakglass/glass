import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/contexts/api-context';
import { router, Href } from 'expo-router';
import type { ConversationPartner } from '@glass/shared';
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

export default function PartnersScreen() {
  const api = useApi();

  const {
    data: partners,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['partners'],
    queryFn: () => api.fetchPartners(),
  });

  const displayPartners = partners || [];

  const frequentPartners = displayPartners.filter((partner) => (partner.conversationCount ?? 0) >= 5);
  const otherPartners = displayPartners.filter((partner) => (partner.conversationCount ?? 0) < 5);

  // Group by first letter
  const groupedPartners = otherPartners.reduce((acc: any, partner: any) => {
    const firstLetter = partner.name[0].toUpperCase();
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(partner);
    return acc;
  }, {});

  const sortedLetters = Object.keys(groupedPartners).sort();

  const handleDeletePartner = (partner: ConversationPartner) => {
    Alert.alert('Remove Partner', `Are you sure you want to remove ${partner.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePartner(partner.id);
            await refetch();
          } catch (err) {
            Alert.alert('Unable to remove partner', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const renderRightActions = (partner: ConversationPartner) => {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={() => handleDeletePartner(partner)}>
        <Ionicons name="trash-outline" size={24} color="#fff" />
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load partners</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Partners</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
            <Text style={styles.searchPlaceholder}>Search</Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* New Partner Button */}
          <TouchableOpacity style={styles.newPartnerButton} onPress={() => router.push('/(app)/new-partner' as Href)}>
            <View style={styles.newPartnerIconContainer}>
              <Ionicons name="add-circle" size={24} color="#0052FF" />
            </View>
            <View style={styles.newPartnerInfo}>
              <Text style={styles.newPartnerText}>New AI Partner</Text>
              <Text style={styles.newPartnerSubtext}>Discover your perfect language partner</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          {/* Frequently Contacted */}
          {frequentPartners.length > 0 && (
            <View style={styles.groupContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Frequently Contacted</Text>
              </View>
              <View style={styles.cardGroup}>
                {frequentPartners.map((item, index) => {
                  const flagSource = item.nativeLang ? getFlagImage(item.nativeLang) : null;
                  return (
                    <Swipeable key={item.id} renderRightActions={() => renderRightActions(item)} overshootRight={false}>
                      <TouchableOpacity
                        style={styles.listItem}
                        onPress={() => router.push(`/(app)/partner/${item.id}` as Href)}
                      >
                        <View style={styles.avatarContainer}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatar, styles.avatarPlaceholder]}>
                              <Ionicons name="person" size={24} color="#999" />
                            </View>
                          )}
                        </View>
                        <View style={styles.partnerInfo}>
                          <View style={styles.nameRow}>
                            <Text style={styles.partnerName}>{item.name}</Text>
                            {flagSource && (
                              <View style={styles.flagBadge}>
                                <Image source={flagSource} style={styles.flagBadgeImage} />
                              </View>
                            )}
                          </View>
                          <Text style={styles.partnerDescription} numberOfLines={1}>
                            {(item.conversationCount ?? 0).toLocaleString()} conversations
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.callButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({
                              pathname: '/(app)/partner-conversation',
                              params: {
                                partnerId: item.id,
                                partnerName: item.name,
                                partnerAvatarUrl: item.avatarUrl || '',
                              },
                            } as any);
                          }}
                        >
                          <Ionicons name="call" size={22} color="#0052FF" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {index < frequentPartners.length - 1 && <View style={styles.separator} />}
                    </Swipeable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Alphabetical Groups */}
          {sortedLetters.map((letter) => (
            <View key={letter} style={styles.groupContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{letter}</Text>
              </View>
              <View style={styles.cardGroup}>
                {groupedPartners[letter].map((item: ConversationPartner, index: number) => {
                  const flagSource = item.nativeLang ? getFlagImage(item.nativeLang) : null;
                  return (
                    <Swipeable key={item.id} renderRightActions={() => renderRightActions(item)} overshootRight={false}>
                      <TouchableOpacity
                        style={styles.listItem}
                        onPress={() => router.push(`/(app)/partner/${item.id}` as Href)}
                      >
                        <View style={styles.avatarContainer}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatar, styles.avatarPlaceholder]}>
                              <Ionicons name="person" size={24} color="#999" />
                            </View>
                          )}
                        </View>
                        <View style={styles.partnerInfo}>
                          <View style={styles.nameRow}>
                            <Text style={styles.partnerName}>{item.name}</Text>
                            {flagSource && (
                              <View style={styles.flagBadge}>
                                <Image source={flagSource} style={styles.flagBadgeImage} />
                              </View>
                            )}
                          </View>
                          <Text style={styles.partnerDescription} numberOfLines={1}>
                            {(item.conversationCount ?? 0).toLocaleString()} conversations
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.callButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({
                              pathname: '/(app)/partner-conversation',
                              params: {
                                partnerId: item.id,
                                partnerName: item.name,
                                partnerAvatarUrl: item.avatarUrl || '',
                              },
                            } as any);
                          }}
                        >
                          <Ionicons name="call" size={22} color="#0052FF" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {index < groupedPartners[letter].length - 1 && <View style={styles.separator} />}
                    </Swipeable>
                  );
                })}
              </View>
            </View>
          ))}

          {displayPartners.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No partners yet</Text>
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
    paddingBottom: 16,
    flexGrow: 1,
  },
  newPartnerButton: {
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
  newPartnerIconContainer: {
    marginRight: 12,
  },
  newPartnerInfo: {
    flex: 1,
  },
  newPartnerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0052FF',
    marginBottom: 2,
  },
  newPartnerSubtext: {
    fontSize: 13,
    color: '#666',
  },
  groupContainer: {
    marginBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
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
  partnerInfo: {
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
  partnerDescription: {
    fontSize: 14,
    color: '#666',
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
