import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useVoiceCall, type VoiceMessage, type AISuggestion, type TTSHighlightState } from '@/hooks/useVoiceCall';
import { useAuth } from '@/contexts/auth-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LiveHighlightedText } from '@/components/LiveHighlightedText';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/contexts/api-context';

type CallErrorType = 'limit_reached' | 'auth_failed' | 'connection_failed' | null;

// Helper function to get partner avatar by ID
const FALLBACK_AVATAR = require('@/assets/glass-ai.png');

const getPartnerAvatar = (partnerId: string) => {
  const avatarMap: { [key: string]: any } = {
    '1': require('@/assets/partners/emma.png'),
    '2': require('@/assets/partners/luc.png'),
    '3': require('@/assets/partners/yui.png'),
    '4': require('@/assets/partners/diego.png'),
    '5': require('@/assets/partners/mei.png'),
    '6': require('@/assets/partners/claire.png'),
    '7': require('@/assets/partners/camila.png'),
    '8': require('@/assets/partners/haruto.png'),
  };
  return avatarMap[partnerId] || require('@/assets/partners/emma.png');
};

// Mock partner data - in real app, this would come from API or route params
const MOCK_PARTNER = {
  id: '1',
  name: 'Emma Wilson',
  avatar: FALLBACK_AVATAR,
};

export default function PartnerConversationScreen() {
  const params = useLocalSearchParams();
  const { snapshot } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const partnerId = params.partnerId as string;
  const partnerName = params.partnerName as string;
  const partnerAvatarId = params.partnerAvatarId as string;
  const partnerAvatarUrl = params.partnerAvatarUrl as string;

  const partnerAvatar = partnerAvatarUrl
    ? { uri: partnerAvatarUrl }
    : partnerAvatarId
    ? getPartnerAvatar(partnerAvatarId)
    : MOCK_PARTNER.avatar;

  // Fetch partner details to get their native language
  const { data: partner } = useQuery({
    queryKey: ['partner', partnerId],
    queryFn: () => api.fetchPartner(partnerId),
    enabled: Boolean(partnerId),
  });

  const [message, setMessage] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const callStartTimeRef = useRef<number | null>(null);
  const [callError, setCallError] = useState<CallErrorType>(null);

  const [isSendingHint, setIsSendingHint] = useState(false);
  const [isCallUIMode, setIsCallUIMode] = useState(true);

  const {
    status,
    messages: voiceMessages,
    isMuted,
    currentSuggestion,
    isSpeaking,
    ttsHighlight,
    conversationId,
    startRecording,
    stopRecording,
    toggleMute,
    clearSuggestion,
    requestSuggestion,
    requestTTS,
    stopSpeaking,
  } = useVoiceCall({
    partnerId: partnerId || '1',
    learningLang: snapshot?.user.learningLang || 'en',
    nativeLang: snapshot?.user.nativeLang || 'en',
    partnerNativeLang: partner?.nativeLang || undefined,
    onMessage: (msg) => {
      console.log('[Conversation] New message:', msg);
      // Scroll to bottom when new message arrives
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    onError: (error) => {
      console.error('[Conversation] Error:', error);

      setIsCallActive(false);
      callStartTimeRef.current = null;

      // Determine error type based on message
      if (error.message.includes('limit reached') || error.message.includes('upgrade')) {
        setCallError('limit_reached');
      } else if (error.message.includes('Authentication') || error.message.includes('sign in')) {
        setCallError('auth_failed');
      } else {
        setCallError('connection_failed');
      }
    },
  });

  // Use voice messages
  const displayMessages = voiceMessages;

  // Set default error when status is error but callError is not set
  useEffect(() => {
    if (status === 'error' && !callError) {
      setCallError('connection_failed');
    }
  }, [status, callError]);

  // Navigate to conversation detail when analysis is complete
  useEffect(() => {
    if (conversationId && status === 'idle') {
      // Invalidate queries to refresh home, calls, and partners tabs
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'home'] });
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partners', 'home'] });

      // Small delay to show the transition
      setTimeout(() => {
        router.push(`/(app)/conversation/${conversationId}`);
      }, 500);
    }
  }, [conversationId, status, queryClient]);

  // Handle skip analyzing
  const handleSkipAnalyzing = () => {
    router.back();
  };

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSendingHint) return;

    setIsSendingHint(true);
    setMessage('');

    try {
      await requestSuggestion(trimmedMessage);
      // Scroll to bottom after suggestion arrives
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('[Conversation] Failed to get suggestion:', error);
    } finally {
      setIsSendingHint(false);
    }
  };

  const handleStartCall = async () => {
    try {
      setIsCallActive(true);
      await startRecording();
    } catch (error) {
      console.error('[Conversation] Failed to start call:', error);
      Alert.alert('Call Error', 'Failed to start the call. Please try again.');
      setIsCallActive(false);
    }
  };

  const handleEndCall = async () => {
    try {
      await stopRecording();
      setIsCallActive(false);
      // Don't navigate back here - wait for analysis to complete
      // Navigation will happen automatically when conversationId is set
    } catch (error) {
      console.error('[Conversation] Failed to end call:', error);
      // On error, go back
      router.back();
    }
  };

  // Play TTS for suggestion
  const handlePlaySuggestion = () => {
    if (currentSuggestion) {
      requestTTS(currentSuggestion.text);
    }
  };

  // Render text with word-by-word highlighting for TTS playback
  const renderHighlightedText = (text: string, messageId: string, baseStyle: any) => {
    // Extract utterance ID from message ID (format: "utt-{utteranceId}-{timestamp}")
    // UUID format: "2f5cbca9-9d1c-4638-9c75-5ad11d8d6acc"
    const utteranceIdMatch = messageId.match(/^utt-([a-f0-9-]+)-\d+$/);
    const utteranceId = utteranceIdMatch ? utteranceIdMatch[1] : null;

    // Check if this message should be highlighted
    if (!ttsHighlight || !utteranceId || ttsHighlight.targetId !== utteranceId) {
      return <LiveHighlightedText text={text} highlight={null} style={baseStyle} />;
    }

    const { segments, activeIndex } = ttsHighlight;
    if (!segments || segments.length === 0 || activeIndex < 0) {
      return <LiveHighlightedText text={text} highlight={null} style={baseStyle} />;
    }

    return (
      <LiveHighlightedText
        text={text}
        highlight={{ segments, activeIndex }}
        style={baseStyle}
        highlightStyle={styles.highlightActive}
      />
    );
  };

  // Format call duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-start call when screen loads
  useEffect(() => {
    handleStartCall();
    return () => {
      if (isCallActive) {
        stopRecording();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track call duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallActive && status === 'recording') {
      if (!callStartTimeRef.current) {
        callStartTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTimeRef.current!) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCallActive, status]);

  const cardTop = insets.top + 8;
  const cardHeight = 48;
  const contentPaddingTop = cardTop + cardHeight + 24;

  // Render Analyzing Overlay
  if (status === 'analyzing') {
    return (
      <View style={styles.analyzingOverlay}>
        <View style={styles.analyzingCard}>
          <ActivityIndicator size="large" color="#0052FF" />
          <Text style={styles.analyzingTitle}>Analyzing Conversation</Text>
          <Text style={styles.analyzingDescription}>
            Glass is reviewing your conversation and generating feedback...
          </Text>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkipAnalyzing}>
            <Text style={styles.skipButtonText}>Skip & Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render Call UI Mode
  if (isCallUIMode) {
    return (
      <View style={styles.callUIContainer}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Call duration and partner info */}
          <View style={[styles.callUIHeader, { paddingTop: insets.top + 20 }]}>
            <Text style={styles.callUITimer}>
              {status === 'connecting' ? 'Connecting...' : formatDuration(callDuration)}
            </Text>
            <View style={styles.callUIPartnerRow}>
              <Image source={partnerAvatar} style={styles.callUIPartnerAvatarSmall} />
              <Text style={styles.callUIPartnerName}>{partnerName || MOCK_PARTNER.name}</Text>
            </View>
          </View>

          {/* Messages area */}
          <View style={{ flex: 1, position: 'relative' }}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.callUIMessagesContainer}
              contentContainerStyle={styles.callUIMessagesContent}
            >
              {displayMessages.map((msg) => (
                <View key={msg.id} style={styles.messageContainer}>
                  {msg.sender === 'partner' && (
                    <View style={styles.messageRow}>
                      <Image source={partnerAvatar} style={styles.messageAvatar} />
                      <View style={styles.messageContent}>
                        <Text style={styles.callUISenderName}>{partnerName || MOCK_PARTNER.name}</Text>
                        <View style={[styles.messageBubble, styles.callUIPartnerBubble]}>
                          {renderHighlightedText(msg.text, msg.id, [styles.messageText, styles.callUIPartnerText])}
                          {msg.translation && (
                            <>
                              <View style={styles.callUIDivider} />
                              <Text style={[styles.translationText, styles.callUIPartnerTranslation]}>
                                {msg.translation}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  )}

                  {msg.sender === 'glass' && (
                    <View style={styles.glassMessageRow}>
                      <View style={styles.glassContent}>
                        <Text style={styles.callUIGlassSenderName}>Glass AI</Text>
                        <View style={[styles.messageBubble, styles.callUIGlassBubble]}>
                          <Text style={[styles.messageText, styles.callUIGlassText]}>{msg.text}</Text>
                          {msg.translation && (
                            <>
                              <View style={styles.callUIDivider} />
                              <Text style={[styles.translationText, styles.callUIGlassTranslation]}>
                                {msg.translation}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                      <Image source={require('@/assets/glass-ai.png')} style={styles.messageAvatar} />
                    </View>
                  )}

                  {msg.sender === 'user' && (
                    <View style={styles.userMessageRow}>
                      <View style={[styles.messageBubble, styles.callUIUserBubble]}>
                        <Text style={styles.callUIUserText}>{msg.text}</Text>
                        {msg.translation && (
                          <>
                            <View style={styles.callUIDivider} />
                            <Text style={styles.callUIUserTranslation}>{msg.translation}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Top gradient fade for messages */}
            <LinearGradient
              colors={['#1c1c1e', 'rgba(28, 28, 30, 0)']}
              style={styles.callUIMessagesGradient}
              pointerEvents="none"
            />
          </View>

          {/* Suggestion Card */}
          {currentSuggestion && (
            <View style={styles.callUISuggestionContainer}>
              <View style={styles.callUISuggestionLabelRow}>
                <Image source={require('@/assets/glass-ai.png')} style={styles.suggestionAvatar} />
                <Text style={styles.callUISuggestionLabel}>Glass AI</Text>
                <View style={styles.suggestionBadge}>
                  <Ionicons name="sparkles" size={10} color="#34C759" />
                </View>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={clearSuggestion} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              <View style={styles.callUISuggestionBubble}>
                <Text style={styles.callUISuggestionText}>{currentSuggestion.text}</Text>
                {(currentSuggestion.pronunciation || currentSuggestion.translation) && (
                  <Text style={styles.callUISuggestionSubtext}>
                    {currentSuggestion.pronunciation || currentSuggestion.translation}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.suggestionListenBtn, isSpeaking && styles.suggestionListenBtnActive]}
                  onPress={isSpeaking ? stopSpeaking : handlePlaySuggestion}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isSpeaking ? 'stop-circle' : 'volume-high'}
                    size={14}
                    color={isSpeaking ? '#fff' : '#34C759'}
                  />
                  <Text style={[styles.suggestionListenBtnText, isSpeaking && styles.suggestionListenBtnTextActive]}>
                    {isSpeaking ? 'Stop' : 'Listen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Input Bar */}
          <View style={[styles.callUIInputContainer, { paddingBottom: 12 + insets.bottom }]}>
            <View style={styles.callUIInputWrapper}>
              <TextInput
                style={styles.callUIInput}
                placeholder="Type what you want to say..."
                placeholderTextColor="#666"
                value={message}
                onChangeText={setMessage}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                returnKeyType="send"
                editable={!isSendingHint}
                maxLength={500}
              />
              <TouchableOpacity
                style={styles.sparkleButton}
                onPress={handleSend}
                disabled={isSendingHint || !message.trim()}
              >
                {isSendingHint ? (
                  <ActivityIndicator size="small" color="#666" />
                ) : (
                  <Ionicons name="sparkles-outline" size={22} color={message.trim() ? '#34C759' : '#666'} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Control buttons */}
          <View style={[styles.callUIControls, { paddingBottom: insets.bottom + 40 }]}>
            <View style={styles.callUIControlItem}>
              <TouchableOpacity style={styles.callUIControlBtn} onPress={() => setIsCallUIMode(false)}>
                <Ionicons name="chatbubbles-outline" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.callUIControlLabel}>Chat</Text>
            </View>

            <View style={styles.callUIControlItem}>
              <TouchableOpacity style={styles.callUIControlBtn} onPress={toggleMute}>
                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={28} color={isMuted ? '#ff3b30' : '#fff'} />
              </TouchableOpacity>
              <Text style={styles.callUIControlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </View>

            <View style={styles.callUIControlItem}>
              <TouchableOpacity style={styles.callUIEndBtn} onPress={handleEndCall}>
                <Ionicons name="call" size={32} color="#fff" style={styles.endCallIcon} />
              </TouchableOpacity>
              <Text style={styles.callUIControlLabel}>End</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Render Normal UI Mode
  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages or Error Screen */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingTop: contentPaddingTop },
            callError && styles.errorContent,
          ]}
        >
          {callError || status === 'error' ? (
            <View style={styles.errorContainer}>
              <Ionicons
                name={
                  callError === 'limit_reached'
                    ? 'lock-closed-outline'
                    : callError === 'auth_failed'
                    ? 'key-outline'
                    : 'cloud-offline-outline'
                }
                size={80}
                color="#ccc"
              />
              <Text style={styles.errorTitle}>
                {callError === 'limit_reached'
                  ? 'Conversation Limit Reached'
                  : callError === 'auth_failed'
                  ? 'Session Expired'
                  : 'Connection Failed'}
              </Text>
              <Text style={styles.errorDescription}>
                {callError === 'limit_reached'
                  ? "You've reached your beta conversation limit. Delete old calls to make room for new ones."
                  : callError === 'auth_failed'
                  ? 'Your session has expired. Please sign in again.'
                  : 'Connection failed. Check your internet and try again.'}
              </Text>
              <View style={styles.errorActions}>
                {callError === 'limit_reached' && (
                  <>
                    <TouchableOpacity
                      style={styles.errorPrimaryButton}
                      onPress={() => {
                        router.back();
                        // Navigate to Calls tab
                        setTimeout(() => {
                          router.push('/(app)/(tabs)/history');
                        }, 100);
                      }}
                    >
                      <Text style={styles.errorPrimaryButtonText}>Manage Calls</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.errorSecondaryButton} onPress={() => router.back()}>
                      <Text style={styles.errorSecondaryButtonText}>Go Back</Text>
                    </TouchableOpacity>
                  </>
                )}
                {callError === 'auth_failed' && (
                  <TouchableOpacity style={styles.errorPrimaryButton} onPress={() => router.back()}>
                    <Text style={styles.errorPrimaryButtonText}>Go Back</Text>
                  </TouchableOpacity>
                )}
                {callError === 'connection_failed' && (
                  <>
                    <TouchableOpacity
                      style={styles.errorPrimaryButton}
                      onPress={() => {
                        setCallError(null);
                        handleStartCall();
                      }}
                    >
                      <Text style={styles.errorPrimaryButtonText}>Try Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.errorSecondaryButton} onPress={() => router.back()}>
                      <Text style={styles.errorSecondaryButtonText}>Go Back</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ) : (
            displayMessages.map((msg) => (
              <View key={msg.id} style={styles.messageContainer}>
                {msg.sender === 'partner' && (
                  <View style={styles.messageRow}>
                    <Image source={partnerAvatar} style={styles.messageAvatar} />
                    <View style={styles.messageContent}>
                      <Text style={styles.senderName}>{partnerName || MOCK_PARTNER.name}</Text>
                      <View style={[styles.messageBubble, styles.partnerBubble]}>
                        {renderHighlightedText(msg.text, msg.id, [styles.messageText, styles.partnerText])}
                        {msg.translation && (
                          <>
                            <View style={styles.divider} />
                            <Text style={[styles.translationText, styles.partnerTranslation]}>{msg.translation}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                )}

                {msg.sender === 'glass' && (
                  <View style={styles.glassMessageRow}>
                    <View style={styles.glassContent}>
                      <Text style={styles.glassSenderName}>Glass AI</Text>
                      <View style={[styles.messageBubble, styles.glassBubble]}>
                        <Text style={[styles.messageText, styles.glassText]}>{msg.text}</Text>
                        {msg.translation && (
                          <>
                            <View style={styles.userDivider} />
                            <Text style={[styles.translationText, styles.glassTranslation]}>{msg.translation}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <Image source={require('@/assets/glass-ai.png')} style={styles.messageAvatar} />
                  </View>
                )}

                {msg.sender === 'user' && (
                  <View style={styles.userMessageRow}>
                    <View style={[styles.messageBubble, styles.userBubble]}>
                      <Text style={styles.userText}>{msg.text}</Text>
                      {msg.translation && (
                        <>
                          <View style={styles.userDivider} />
                          <Text style={styles.userTranslation}>{msg.translation}</Text>
                        </>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* Suggestion Card - Compact iOS style */}
        {!callError && status !== 'error' && currentSuggestion && (
          <View style={styles.suggestionContainer}>
            <View style={styles.suggestionLabelRow}>
              <Image source={require('@/assets/glass-ai.png')} style={styles.suggestionAvatar} />
              <Text style={styles.suggestionLabel}>Glass AI</Text>
              <View style={styles.suggestionBadge}>
                <Ionicons name="sparkles" size={10} color="#34C759" />
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={clearSuggestion} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <View style={styles.suggestionBubble}>
              <Text style={styles.suggestionText}>{currentSuggestion.text}</Text>
              {(currentSuggestion.pronunciation || currentSuggestion.translation) && (
                <Text style={styles.suggestionSubtext}>
                  {currentSuggestion.pronunciation || currentSuggestion.translation}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.suggestionListenBtn, isSpeaking && styles.suggestionListenBtnActive]}
                onPress={isSpeaking ? stopSpeaking : handlePlaySuggestion}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isSpeaking ? 'stop-circle' : 'volume-high'}
                  size={14}
                  color={isSpeaking ? '#fff' : '#34C759'}
                />
                <Text style={[styles.suggestionListenBtnText, isSpeaking && styles.suggestionListenBtnTextActive]}>
                  {isSpeaking ? 'Stop' : 'Listen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Input Bar */}
        {!callError && status !== 'error' && (
          <View style={[styles.inputContainer, { paddingBottom: 12 + insets.bottom }]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Type what you want to say in Korean"
                placeholderTextColor="#999"
                value={message}
                onChangeText={setMessage}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                returnKeyType="send"
                editable={!isSendingHint}
                maxLength={500}
              />
              <TouchableOpacity
                style={styles.sparkleButton}
                onPress={handleSend}
                disabled={isSendingHint || !message.trim()}
              >
                {isSendingHint ? (
                  <ActivityIndicator size="small" color="#999" />
                ) : (
                  <Ionicons name="sparkles-outline" size={22} color={message.trim() ? '#0052FF' : '#999'} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Floating Card Overlay */}
      <View style={[styles.overlayCard, { top: cardTop }]}>
        <View style={styles.cardLeftBtns}>
          <TouchableOpacity style={styles.cardIconBtn} onPress={() => setIsCallUIMode(true)}>
            <Ionicons name="phone-portrait-outline" size={16} color="rgba(60, 60, 67, 0.9)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardIconBtn} onPress={toggleMute}>
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={16}
              color={isMuted ? '#ff3b30' : 'rgba(60, 60, 67, 0.9)'}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.cardCenter}>
          <Text style={styles.cardName} numberOfLines={1}>
            {partnerName || MOCK_PARTNER.name}
          </Text>
          <Text style={styles.cardDuration}>{status === 'connecting' ? '...' : formatDuration(callDuration)}</Text>
        </View>

        <TouchableOpacity onPress={handleEndCall} style={styles.endCallBtn}>
          <Ionicons name="call" size={16} color="#fff" style={styles.endCallIcon} />
        </TouchableOpacity>
      </View>

      {/* Subtle gradient fade below card */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0)']}
        style={[styles.cardGradient, { top: cardTop + cardHeight }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // Analyzing Overlay Styles
  analyzingOverlay: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  analyzingCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  analyzingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  analyzingDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  skipButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 160,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  // Call UI Mode Styles
  callUIContainer: {
    flex: 1,
    backgroundColor: '#1c1c1e',
  },
  callUIBackBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  callUIHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  callUITimer: {
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '300',
    marginBottom: 12,
  },
  callUIPartnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  callUIPartnerAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  callUIPartnerName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  callUIMessagesContainer: {
    flex: 1,
    marginTop: 20,
  },
  callUIMessagesContent: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
  },
  callUIMessagesGradient: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    height: 60,
    zIndex: 10,
  },
  callUISenderName: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    marginLeft: 4,
  },
  callUIGlassSenderName: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    marginRight: 4,
    textAlign: 'right',
  },
  callUIPartnerBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  callUIPartnerText: {
    color: '#fff',
  },
  callUIGlassBubble: {
    backgroundColor: 'rgba(52, 199, 93, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 93, 0.3)',
    borderBottomRightRadius: 4,
  },
  callUIGlassText: {
    color: '#fff',
  },
  callUIUserBubble: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    borderBottomRightRadius: 4,
    maxWidth: '80%',
  },
  callUIUserText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 21,
  },
  callUIDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 8,
  },
  callUIPartnerTranslation: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  callUIGlassTranslation: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  callUIUserTranslation: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    lineHeight: 19,
    opacity: 0.85,
  },
  callUIControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
    paddingHorizontal: 20,
  },
  callUIControlItem: {
    alignItems: 'center',
    gap: 8,
  },
  callUIControlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callUIControlBtnMuted: {
    backgroundColor: '#ff3b30',
  },
  callUIEndBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callUIControlLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#fff',
  },
  callUISuggestionContainer: {
    marginHorizontal: 24,
    marginBottom: 16,
  },
  callUISuggestionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  callUISuggestionLabel: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '600',
  },
  callUISuggestionBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  callUISuggestionText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 21,
  },
  callUISuggestionSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18,
    marginTop: 4,
  },
  callUIInputContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: 'transparent',
  },
  callUIInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    paddingLeft: 18,
    paddingRight: 8,
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  callUIInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    maxHeight: 100,
    paddingVertical: 12,
  },
  overlayCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(60, 60, 67, 0.75)',
    borderRadius: 24,
  },
  cardLeftBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIconBtnMuted: {
    backgroundColor: '#ff3b30',
  },
  cardCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  cardDuration: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 1,
  },
  endCallBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallIcon: {
    transform: [{ rotate: '135deg' }],
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  partnerBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  glassBubble: {
    backgroundColor: '#34C75D',
    borderBottomRightRadius: 4,
  },
  userMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userBubble: {
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
  highlightActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  highlightPast: {
    color: '#374151',
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
  suggestionContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  suggestionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  suggestionAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  suggestionLabel: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '600',
  },
  suggestionBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionBubble: {
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  suggestionText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 21,
  },
  suggestionSubtext: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginTop: 3,
  },
  suggestionListenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderRadius: 12,
    marginTop: 8,
    gap: 4,
  },
  suggestionListenBtnActive: {
    backgroundColor: '#34C759',
  },
  suggestionListenBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },
  suggestionListenBtnTextActive: {
    color: '#fff',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    maxHeight: 100,
    paddingVertical: 10,
  },
  sparkleButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Error screen styles
  errorContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  errorActions: {
    width: '100%',
    gap: 12,
  },
  errorPrimaryButton: {
    backgroundColor: '#0052FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorPrimaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  errorSecondaryButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorSecondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
});
