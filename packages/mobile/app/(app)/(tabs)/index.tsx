import { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { useApi } from '@/contexts/api-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const FLAG_ASSETS: Record<string, any> = {
  en: require('@/assets/us.png'),
  us: require('@/assets/us.png'),
  kr: require('@/assets/kr.png'),
  ko: require('@/assets/kr.png'),
  es: require('@/assets/es.png'),
  fr: require('@/assets/fr.png'),
  ja: require('@/assets/ja.png'),
};

const getFlagSource = (code?: string | null) => {
  if (!code) return null;
  return FLAG_ASSETS[code.toLowerCase()] || null;
};

const formatPracticeTime = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m`;
};

const getInitials = (name?: string | null) => {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
};

const getAvatarColor = (name?: string | null) => {
  if (!name) return '#999';
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

// Partner images for avatar animation
const PARTNER_AVATARS = [
  require('@/assets/partners/emma.png'),
  require('@/assets/partners/jiwoo.png'),
  require('@/assets/partners/alex.png'),
  require('@/assets/partners/mei.png'),
  require('@/assets/partners/diego.png'),
  require('@/assets/partners/claire.png'),
  require('@/assets/partners/haruto.png'),
  require('@/assets/partners/yui.png'),
];

// Animated avatars stack component with carousel effect
const AnimatedAvatarsStack = () => {
  const [currentAvatars, setCurrentAvatars] = useState([0, 1, 2, 3]);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out all avatars
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        // Update avatars: shift left and add new one at the end
        setCurrentAvatars((prev) => {
          const newLast = (prev[3] + 1) % PARTNER_AVATARS.length;
          return [prev[1], prev[2], prev[3], newLast];
        });

        // Fade in new avatars
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.avatarsStack, { opacity: fadeAnim }]}>
      {currentAvatars.map((avatarIdx, idx) => (
        <Image
          key={`${idx}-${avatarIdx}`}
          source={PARTNER_AVATARS[avatarIdx]}
          style={[
            styles.stackedAvatar,
            {
              left: idx * 32,
              zIndex: 4 - idx,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

export default function HomeScreen() {
  const { snapshot, user } = useAuth();
  const api = useApi();
  const { data: conversationData, isLoading: isConversationsLoading } = useQuery({
    queryKey: ['conversations', 'home'],
    queryFn: () => api.fetchConversationSummaries({ limit: 50 }),
  });

  const { data: partners, isLoading: isPartnersLoading } = useQuery({
    queryKey: ['partners', 'home'],
    queryFn: () => api.fetchPartners(),
  });

  const conversations = conversationData?.conversations ?? [];
  const availablePartners = partners || [];

  const totalDurationSeconds = useMemo(
    () => conversations.reduce((sum, convo) => sum + (convo.durationSeconds || 0), 0),
    [conversations]
  );

  const practiceTimeLabel = useMemo(() => formatPracticeTime(totalDurationSeconds), [totalDurationSeconds]);

  const scoreAverages = useMemo(() => {
    const totals = conversations.reduce(
      (acc, convo) => {
        if (!convo.scores) {
          return acc;
        }
        acc.fluency += convo.scores.fluency || 0;
        acc.accuracy += convo.scores.accuracy || 0;
        acc.comprehensibility += convo.scores.comprehensibility || 0;
        acc.count += 1;
        if (typeof convo.scores.overall === 'number') {
          acc.overall += convo.scores.overall;
          acc.overallCount += 1;
        }
        return acc;
      },
      { fluency: 0, accuracy: 0, comprehensibility: 0, overall: 0, count: 0, overallCount: 0 }
    );

    return {
      fluency: totals.count ? Math.round(totals.fluency / totals.count) : null,
      accuracy: totals.count ? Math.round(totals.accuracy / totals.count) : null,
      comprehensibility: totals.count ? Math.round(totals.comprehensibility / totals.count) : null,
      overall: totals.overallCount ? Math.round(totals.overall / totals.overallCount) : null,
    };
  }, [conversations]);

  const activeDays = useMemo(() => {
    const seen = new Set<string>();
    conversations.forEach((convo) => {
      if (convo.startedAt) {
        seen.add(convo.startedAt.toDateString());
      }
    });
    return seen.size;
  }, [conversations]);

  const chartData = useMemo(() => {
    const totals: Record<string, number> = {};
    conversations.forEach((convo) => {
      if (!convo.startedAt || !convo.durationSeconds) return;
      const key = convo.startedAt.toISOString().split('T')[0];
      totals[key] = (totals[key] || 0) + convo.durationSeconds;
    });
    const today = new Date();
    const items = [];
    const hasData = Object.keys(totals).length > 0;

    // Placeholder data for empty state
    const placeholderMinutes = [8, 15, 6, 18, 12, 4, 10];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = date.toISOString().split('T')[0];
      items.push({
        key,
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        friendlyDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minutes: hasData ? Math.round((totals[key] || 0) / 60) : placeholderMinutes[6 - i],
        isPlaceholder: !hasData,
      });
    }
    return items;
  }, [conversations]);

  const chartMaxMinutes = Math.max(30, ...chartData.map((item) => item.minutes));
  const yAxisLabels = useMemo(() => {
    return [chartMaxMinutes, Math.round(chartMaxMinutes * 0.66), Math.round(chartMaxMinutes * 0.33), 0];
  }, [chartMaxMinutes]);
  const chartRangeLabel = chartData.length
    ? `${chartData[0].friendlyDate} – ${chartData[chartData.length - 1].friendlyDate}`
    : 'No practice yet';
  const totalConversations = conversationData?.total ?? conversations.length;
  const nativeFlag = getFlagSource(snapshot?.user.nativeLang);
  const learningFlag = getFlagSource(snapshot?.user.learningLang);
  const latestScores = [
    { label: 'Fluency', value: scoreAverages.fluency, color: '#10b981' },
    { label: 'Accuracy', value: scoreAverages.accuracy, color: '#f59e0b' },
    { label: 'Comprehensibility', value: scoreAverages.comprehensibility, color: '#6366f1' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Image source={require('@/assets/glass-ai.png')} style={styles.headerAvatar} />
        <Text style={styles.headerTitle}>Home</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* User Profile Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.userProfileCard}>
            <View style={[styles.userProfileAvatar, { backgroundColor: getAvatarColor(user?.name) }]}>
              <Text style={styles.avatarInitials}>{getInitials(user?.name)}</Text>
            </View>
            <View style={styles.userProfileInfo}>
              <Text style={styles.userProfileName}>{user?.name || 'User'}</Text>
              <View style={styles.languageRow}>
                <View style={styles.languageItem}>
                  <Text style={styles.languageLabel}>Speaks</Text>
                  <View style={styles.flagCircle}>
                    {nativeFlag ? (
                      <Image source={nativeFlag} style={styles.flagImage} />
                    ) : (
                      <Text style={styles.flagPlaceholderText}>
                        {(snapshot?.user.nativeLang || '--').toUpperCase()}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.languageDivider}>·</Text>
                <View style={styles.languageItem}>
                  <Text style={styles.languageLabel}>Learns</Text>
                  <View style={styles.flagCircle}>
                    {learningFlag ? (
                      <Image source={learningFlag} style={styles.flagImage} />
                    ) : (
                      <Text style={styles.flagPlaceholderText}>
                        {(snapshot?.user.learningLang || '--').toUpperCase()}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Call to Action Section */}
        {availablePartners.length > 0 ? (
          // Show partner cards when partners exist
          <View style={styles.gettingStartedSection}>
            <Text style={styles.sectionTitle}>Ready to Practice?</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.partnersScrollContent}
            >
              {availablePartners.slice(0, 3).map((partner) => (
                <TouchableOpacity
                  key={partner.id}
                  style={styles.partnerCallCard}
                  onPress={() => router.push(`/(app)/partner/${partner.id}` as any)}
                  activeOpacity={0.8}
                >
                  {partner.avatarUrl ? (
                    <Image source={{ uri: partner.avatarUrl }} style={styles.partnerCallAvatar} />
                  ) : (
                    <View style={[styles.partnerCallAvatar, styles.partnerCallAvatarPlaceholder]}>
                      <Ionicons name="person" size={40} color="#999" />
                    </View>
                  )}
                  <Text style={styles.partnerCallName}>{partner.name}</Text>
                  <Text style={styles.partnerCallRole}>{partner.personaOccupation || 'Conversation Partner'}</Text>
                  <TouchableOpacity
                    style={styles.startCallButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push({
                        pathname: '/(app)/partner-conversation',
                        params: {
                          partnerId: partner.id,
                          partnerName: partner.name,
                          partnerAvatarUrl: partner.avatarUrl || '',
                        },
                      } as any);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="call" size={20} color="#fff" />
                    <Text style={styles.startCallButtonText}>Start Call</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addPartnerCard}
                onPress={() => router.push('/(app)/new-partner')}
                activeOpacity={0.8}
              >
                <View style={styles.addPartnerIcon}>
                  <Ionicons name="add" size={32} color="#0052FF" />
                </View>
                <Text style={styles.addPartnerText}>Find More Partners</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : (
          // Show getting started card for new users
          conversations.length === 0 && (
            <View style={styles.gettingStartedSection}>
              <View style={styles.gettingStartedCard}>
                {/* Overlapping Avatars */}
                <AnimatedAvatarsStack />
                <Text style={styles.gettingStartedTitle}>Match Your First AI Partner</Text>
                <Text style={styles.gettingStartedDescription}>
                  Meet conversation partners that match your preferences
                </Text>
                <TouchableOpacity
                  style={styles.gettingStartedButton}
                  onPress={() => router.push('/(app)/new-partner')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gettingStartedButtonText}>Discover Partners</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )
        )}

        {/* Analytics Section */}
        <View style={styles.analyticsSection}>
          {/* Main Chart Card */}
          <View style={styles.mainChartCard}>
            {isConversationsLoading && <ActivityIndicator size="small" color="#0052FF" style={styles.chartLoader} />}
            {/* Total Header */}
            <View style={styles.totalHeader}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>
                {practiceTimeLabel} <Text style={styles.totalUnit}>practice time</Text>
              </Text>
              <Text style={styles.totalDate}>{chartRangeLabel}</Text>
            </View>

            {/* Large Chart */}
            <View style={styles.largeChartContainerWrapper}>
              <View style={styles.largeChartContainer}>
                <View style={styles.chartYAxis}>
                  {yAxisLabels.map((label, idx) => (
                    <Text key={idx} style={styles.yAxisLabel}>
                      {label}m
                    </Text>
                  ))}
                </View>
                <View style={styles.largeChart}>
                  {chartData.map((item) => {
                    const heightPercent = chartMaxMinutes > 0 ? (item.minutes / chartMaxMinutes) * 100 : 0;
                    const isPlaceholder = (item as any).isPlaceholder;
                    return (
                      <View key={item.key || item.day} style={styles.largeChartBar}>
                        <View style={styles.largeChartBarContainer}>
                          <View
                            style={[
                              styles.largeChartBarFill,
                              { height: `${heightPercent}%` },
                              isPlaceholder && styles.largeChartBarPlaceholder,
                            ]}
                          />
                        </View>
                        <Text style={[styles.largeChartDay, isPlaceholder && styles.largeChartDayPlaceholder]}>
                          {item.day}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {conversations.length === 0 && (
                <View style={styles.emptyChartOverlay}>
                  <Text style={styles.emptyChartOverlayText}>Start a call to see your progress.</Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statCardValue}>{scoreAverages.overall ?? '--'}</Text>
              <Text style={styles.statCardLabel}>Avg Score</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statCardValue}>{totalConversations}</Text>
              <Text style={styles.statCardLabel}>Conversations</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statCardValue}>{activeDays}</Text>
              <Text style={styles.statCardLabel}>Active Days</Text>
            </View>
          </View>

          {/* Score Breakdown */}
          {conversations.length > 0 && (
            <View style={styles.scoreBreakdownCard}>
              <Text style={styles.scoreBreakdownTitle}>Latest Scores</Text>
              <View style={styles.scoreBreakdownList}>
                {latestScores.map((item) => {
                  const value = item.value ?? 0;
                  return (
                    <View key={item.label} style={styles.scoreBreakdownItem}>
                      <Text style={styles.scoreBreakdownLabel}>{item.label}</Text>
                      <View style={styles.scoreBreakdownRight}>
                        <View style={styles.scoreBreakdownBarContainer}>
                          <View
                            style={[
                              styles.scoreBreakdownBar,
                              { width: `${Math.min(value, 100)}%`, backgroundColor: item.color },
                            ]}
                          />
                        </View>
                        <Text style={styles.scoreBreakdownValue}>
                          {item.value !== null && item.value !== undefined ? item.value : '--'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 16,
  },
  sectionContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleInRow: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0052FF',
  },
  userProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userProfileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  avatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userProfileInfo: {
    flex: 1,
  },
  userProfileName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 3,
  },
  userProfileLanguage: {
    fontSize: 14,
    color: '#666',
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  languageLabel: {
    fontSize: 14,
    color: '#666',
  },
  flagCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginLeft: 4,
  },
  flagImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  flagPlaceholderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  languageDivider: {
    fontSize: 14,
    color: '#999',
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0052FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  statusInfo: {
    flex: 1,
  },
  statusName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  partnerAvatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  partnerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  partnerAvatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  partnerInfoExpanded: {
    flex: 1,
  },
  partnerNameRow: {
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
  languageBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: '#f0f0f0',
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  languageBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.3,
  },
  partnerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  callButton: {
    padding: 8,
  },
  gettingStartedSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  partnersScrollContent: {
    paddingRight: 16,
    gap: 12,
  },
  partnerCallCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  partnerCallAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  partnerCallAvatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  partnerCallName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
    textAlign: 'center',
  },
  partnerCallRole: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  startCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#0052FF',
  },
  startCallButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  addPartnerCard: {
    width: 160,
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  addPartnerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  addPartnerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0052FF',
    textAlign: 'center',
  },
  analyticsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
    marginBottom: 20,
  },
  mainChartCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chartLoader: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  totalHeader: {
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  totalUnit: {
    fontSize: 20,
    fontWeight: '400',
    color: '#999',
  },
  totalDate: {
    fontSize: 14,
    color: '#999',
  },
  largeChartContainerWrapper: {
    position: 'relative',
  },
  largeChartContainer: {
    flexDirection: 'row',
    height: 200,
  },
  chartYAxis: {
    width: 40,
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingRight: 8,
  },
  yAxisLabel: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
  },
  largeChart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 28,
  },
  emptyChartText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyChartOverlay: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    pointerEvents: 'none',
  },
  emptyChartOverlayText: {
    textAlign: 'center',
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  largeChartDayPlaceholder: {
    color: '#666',
  },
  largeChartBar: {
    flex: 1,
    alignItems: 'center',
  },
  largeChartBarContainer: {
    width: '100%',
    height: 172,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  largeChartBarFill: {
    width: '100%',
    backgroundColor: '#FF5722',
    borderRadius: 4,
    minHeight: 3,
  },
  largeChartBarPlaceholder: {
    backgroundColor: '#b0b0b0',
    opacity: 1,
  },
  largeChartDay: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statCardValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  statCardLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  scoreBreakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  scoreBreakdownTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  scoreBreakdownList: {
    gap: 16,
  },
  scoreBreakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreBreakdownLabel: {
    fontSize: 14,
    color: '#000',
    width: 130,
  },
  scoreBreakdownRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreBreakdownBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBreakdownBar: {
    height: '100%',
    borderRadius: 4,
  },
  scoreBreakdownValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    width: 28,
    textAlign: 'right',
  },
  gettingStartedCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  avatarsStack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    width: 168,
    marginBottom: 16,
    position: 'relative',
  },
  stackedAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    position: 'absolute',
    left: 0,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  gettingStartedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  gettingStartedDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  gettingStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#0052FF',
  },
  gettingStartedButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
