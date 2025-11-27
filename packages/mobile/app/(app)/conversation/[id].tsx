import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/contexts/api-context';
import type { ConversationMessage } from '@glass/shared';

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const api = useApi();
  const queryClient = useQueryClient();
  const [showConversation, setShowConversation] = useState(false);

  const { data: conversation, isLoading, error } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.fetchConversationDetail(id!),
    enabled: Boolean(id),
  });

  if (!id) {
    router.back();
    return null;
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#14b8a6';
    if (score >= 40) return '#f59e0b';
    if (score >= 20) return '#fb923c';
    return '#ef4444';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    if (score >= 20) return 'Below Average';
    return 'Low';
  };

  const scores = conversation?.scores;
  const averageScore =
    scores && typeof scores.fluency === 'number' && typeof scores.accuracy === 'number' && typeof scores.comprehensibility === 'number'
      ? Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3)
      : null;

  const handleDelete = () => {
    Alert.alert('Delete Conversation', 'Are you sure you want to delete this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteConversation(id);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.removeQueries({ queryKey: ['conversation', id] });
            router.back();
          } catch (err) {
            Alert.alert('Unable to delete', err instanceof Error ? err.message : 'Please try again later.');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0052FF" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !conversation) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Unable to load conversation.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const partnerAvatarSource = conversation.partner?.avatarUrl
    ? { uri: conversation.partner.avatarUrl }
    : require('@/assets/glass-ai.png');
  const startedAt = conversation.startedAt ? formatDate(conversation.startedAt) : null;
  const messages = (conversation.messages as ConversationMessage[]) || [];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header */}
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={22} color="#ff3b30" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{conversation.title || 'Conversation'}</Text>
          <View style={styles.metaRow}>
            {startedAt && <Text style={styles.metaText}>{startedAt}</Text>}
            {startedAt && conversation.durationSeconds ? <Text style={styles.metaDivider}>•</Text> : null}
            {conversation.durationSeconds && (
              <Text style={styles.metaText}>{formatDuration(conversation.durationSeconds)}</Text>
            )}
          </View>
        </View>

        {/* Partner Info */}
        {conversation.partner && (
          <View style={styles.partnerCard}>
            <Image source={partnerAvatarSource} style={styles.partnerAvatar} />
            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName}>{conversation.partner.name}</Text>
              <Text style={styles.partnerLabel}>Partner</Text>
            </View>
          </View>
        )}

        {/* Scores Section */}
        {scores && (
          <View style={styles.scoresSection}>
            <View style={styles.overallScoreCard}>
              <Text style={styles.overallScoreLabel}>Overall Score</Text>
              <Text style={styles.overallScoreValue}>{averageScore ?? '—'}</Text>
              {typeof averageScore === 'number' && (
                <Text style={[styles.overallScoreText, { color: getScoreColor(averageScore) }]}>
                  {getScoreLabel(averageScore)}
                </Text>
              )}
            </View>

            {/* Individual Scores */}
            <View style={styles.scoresList}>
              {/* Fluency */}
              <View style={styles.scoreItem}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreLabel}>Fluency</Text>
                  <Text style={[styles.scoreText, { color: getScoreColor(scores.fluency) }]}>
                    {getScoreLabel(scores.fluency)}
                  </Text>
                </View>
                <View style={styles.scoreBarContainer}>
                  <View
                    style={[
                      styles.scoreBar,
                      {
                        width: `${scores.fluency}%`,
                        backgroundColor: getScoreColor(scores.fluency),
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Accuracy */}
              <View style={styles.scoreItem}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreLabel}>Accuracy</Text>
                  <Text style={[styles.scoreText, { color: getScoreColor(scores.accuracy) }]}>
                    {getScoreLabel(scores.accuracy)}
                  </Text>
                </View>
                <View style={styles.scoreBarContainer}>
                  <View
                    style={[
                      styles.scoreBar,
                      {
                        width: `${scores.accuracy}%`,
                        backgroundColor: getScoreColor(scores.accuracy),
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Comprehensibility */}
              <View style={styles.scoreItem}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreLabel}>Comprehensibility</Text>
                  <Text style={[styles.scoreText, { color: getScoreColor(scores.comprehensibility) }]}>
                    {getScoreLabel(scores.comprehensibility)}
                  </Text>
                </View>
                <View style={styles.scoreBarContainer}>
                  <View
                    style={[
                      styles.scoreBar,
                      {
                        width: `${scores.comprehensibility}%`,
                        backgroundColor: getScoreColor(scores.comprehensibility),
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Glass AI Feedback */}
        {conversation.feedback && (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackHeader}>
              <Image source={require('@/assets/glass-ai.png')} style={styles.glassAvatar} />
              <Text style={styles.feedbackTitle}>Glass AI Feedback</Text>
            </View>
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackText}>{conversation.feedback}</Text>
            </View>
          </View>
        )}

        {/* Conversation History */}
        {messages.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionToggle}
              onPress={() => setShowConversation(!showConversation)}
            >
              <View style={styles.sectionToggleLeft}>
                <Ionicons name="chatbubble-outline" size={18} color="#666" />
                <Text style={styles.sectionTitle}>Conversation History</Text>
                <Text style={styles.sectionCount}>({messages.length})</Text>
              </View>
              <Ionicons
                name={showConversation ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>

            {showConversation && (
              <View style={styles.sectionContent}>
                {messages.map((message: ConversationMessage, index: number) => {
                  const isUser = message.role === 'user';
                  const isGlass = message.role === 'assistant';
                  const isPartner = message.role === 'partner';

                  return (
                    <View key={index} style={styles.messageContainer}>
                      {isPartner && (
                        <View style={styles.messageRow}>
                          <Image source={partnerAvatarSource} style={styles.messageAvatar} />
                          <View style={styles.messageContent}>
                            <Text style={styles.senderName}>{conversation.partner?.name || 'Partner'}</Text>
                            <View style={[styles.messageBubble, styles.partnerMessageBubble]}>
                              <Text style={[styles.messageText, styles.partnerText]}>{message.text}</Text>
                              {message.translation && (
                                <>
                                  <View style={styles.divider} />
                                  <Text style={[styles.translationText, styles.partnerTranslation]}>
                                    {message.translation}
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>
                        </View>
                      )}

                      {isGlass && (
                        <View style={styles.glassMessageRow}>
                          <View style={styles.glassContent}>
                            <Text style={styles.glassSenderName}>Glass AI</Text>
                            <View style={[styles.messageBubble, styles.glassMessageBubble]}>
                              <Text style={[styles.messageText, styles.glassText]}>
                                {message.text}
                              </Text>
                              {message.translation && (
                                <>
                                  <View style={styles.userDivider} />
                                  <Text style={[styles.translationText, styles.glassTranslation]}>
                                    {message.translation}
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>
                          <Image
                            source={require('@/assets/glass-ai.png')}
                            style={styles.messageAvatar}
                          />
                        </View>
                      )}

                      {isUser && (
                        <View style={styles.userMessageRow}>
                          <View style={[styles.messageBubble, styles.userMessageBubble]}>
                            <Text style={styles.userText}>{message.text}</Text>
                            {message.translation && (
                              <>
                                <View style={styles.userDivider} />
                                <Text style={styles.userTranslation}>{message.translation}</Text>
                              </>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
  },
  metaDivider: {
    fontSize: 14,
    color: '#ccc',
  },
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  partnerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  partnerLabel: {
    fontSize: 14,
    color: '#666',
  },
  scoresSection: {
    marginBottom: 20,
  },
  overallScoreCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  overallScoreLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  overallScoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  overallScoreText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scoresList: {
    gap: 16,
  },
  scoreItem: {
    gap: 8,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 13,
    color: '#666',
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scoreBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
    borderRadius: 4,
  },
  feedbackSection: {
    marginBottom: 20,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  glassAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  feedbackCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  feedbackText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  section: {
    marginBottom: 16,
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  sectionToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  sectionCount: {
    fontSize: 13,
    color: '#666',
  },
  sectionContent: {
    marginTop: 12,
    gap: 0,
  },
  messageContainer: {
    marginBottom: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 4,
  },
  messageContent: {
    flex: 1,
    maxWidth: '80%',
  },
  senderName: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666',
    marginBottom: 4,
    marginLeft: 4,
  },
  glassSenderName: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666',
    marginBottom: 4,
    marginRight: 4,
    textAlign: 'right',
  },
  glassMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    justifyContent: 'flex-end',
  },
  glassContent: {
    maxWidth: '80%',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  partnerMessageBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  glassMessageBubble: {
    backgroundColor: '#34C75D',
    borderBottomRightRadius: 4,
  },
  userMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userMessageBubble: {
    backgroundColor: '#017BFF',
    borderBottomRightRadius: 4,
    maxWidth: '80%',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 21,
  },
  partnerText: {
    color: '#000',
  },
  glassText: {
    color: '#fff',
  },
  userText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 21,
  },
  divider: {
    height: 1,
    backgroundColor: '#d0d0d0',
    marginVertical: 8,
  },
  userDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginVertical: 8,
  },
  translationText: {
    fontSize: 14,
    lineHeight: 19,
    opacity: 0.85,
  },
  partnerTranslation: {
    color: '#666',
  },
  glassTranslation: {
    color: '#fff',
  },
  userTranslation: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
    opacity: 0.85,
  },
});
