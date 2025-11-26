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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

// Mock conversation data
const MOCK_MESSAGES = [
  {
    id: '1',
    original: '¡Hola! ¿Cómo te sientes hoy?',
    translation: '안녕하세요! 오늘 기분이 어때요?',
    sender: 'partner',
  },
  {
    id: '2',
    original: '안녕하세요! 저는 좋아요. 오늘 날씨가 정말 좋네요.',
    translation: "Hello! I'm good. The weather is really nice today.",
    sender: 'user',
  },
  {
    id: '3',
    original: '¡Así es! Es un día perfecto para caminar. ¿Qué vas a hacer el fin de semana?',
    translation: '맞아요! 완벽한 산책 날씨예요. 주말에 뭐 하실 거예요?',
    sender: 'partner',
  },
  {
    id: '4',
    original: '아마 친구들이랑 카페에 갈 것 같아요.',
    translation: "I think I'll go to a cafe with my friends.",
    sender: 'user',
  },
  {
    id: '5',
    original: '¡Buen plan! ¿A qué café vas a ir?',
    translation: '좋은 계획이네요! 어떤 카페에 가실 거예요?',
    sender: 'partner',
  },
  {
    id: '6',
    original:
      '좋아요! "친구들이랑"보다 "친구들과"가 더 자연스러워요. 그리고 "갈 것 같아요" 대신 "갈 거예요"라고 말하면 더 확실하게 들려요!',
    translation: `Great! "친구들과" sounds more natural than "친구들이랑". Also, saying "갈 거예요" instead of "갈 것 같아요" sounds more confident!`,
    sender: 'glass',
  },
];

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
  const partnerId = params.partnerId as string;
  const partnerName = params.partnerName as string;
  const partnerAvatarId = params.partnerAvatarId as string;
  const partnerAvatarUrl = params.partnerAvatarUrl as string;

  const partnerAvatar = partnerAvatarUrl
    ? { uri: partnerAvatarUrl }
    : partnerAvatarId
      ? getPartnerAvatar(partnerAvatarId)
      : MOCK_PARTNER.avatar;

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(MOCK_MESSAGES);

  const handleSend = () => {
    if (message.trim()) {
      const newMessage = {
        id: Date.now().toString(),
        original: message.trim(),
        translation: '[Translation will appear here]',
        sender: 'user' as const,
      };
      setMessages([...messages, newMessage]);
      setMessage('');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image source={partnerAvatar} style={styles.headerAvatar} />
          <Text style={styles.headerName} numberOfLines={1}>
            {partnerName || MOCK_PARTNER.name}
          </Text>
        </View>

        <TouchableOpacity onPress={() => router.back()} style={styles.endCallButton}>
          <View style={styles.endCallIconWrapper}>
            <Ionicons name="call" size={24} color="#ff3b30" />
          </View>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
          {messages.map((msg) => (
            <View key={msg.id} style={styles.messageContainer}>
              {msg.sender === 'partner' && (
                <View style={styles.messageRow}>
                  <Image source={partnerAvatar} style={styles.messageAvatar} />
                  <View style={styles.messageContent}>
                    <Text style={styles.senderName}>{partnerName || MOCK_PARTNER.name}</Text>
                    <View style={[styles.messageBubble, styles.partnerBubble]}>
                      <Text style={[styles.messageText, styles.partnerText]}>{msg.original}</Text>
                      <View style={styles.divider} />
                      <Text style={[styles.translationText, styles.partnerTranslation]}>{msg.translation}</Text>
                    </View>
                  </View>
                </View>
              )}

              {msg.sender === 'glass' && (
                <View style={styles.glassMessageRow}>
                  <View style={styles.glassContent}>
                    <Text style={styles.glassSenderName}>Glass AI</Text>
                    <View style={[styles.messageBubble, styles.glassBubble]}>
                      <Text style={[styles.messageText, styles.glassText]}>{msg.original}</Text>
                      <View style={styles.userDivider} />
                      <Text style={[styles.translationText, styles.glassTranslation]}>{msg.translation}</Text>
                    </View>
                  </View>
                  <Image source={require('@/assets/glass-ai.png')} style={styles.messageAvatar} />
                </View>
              )}

              {msg.sender === 'user' && (
                <View style={styles.userMessageRow}>
                  <View style={[styles.messageBubble, styles.userBubble]}>
                    <Text style={styles.userText}>{msg.original}</Text>
                    <View style={styles.userDivider} />
                    <Text style={styles.userTranslation}>{msg.translation}</Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <View style={styles.translateButton}>
              <Ionicons name="language" size={22} color="#666" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Type what you want to say in Korean"
              placeholderTextColor="#999"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={styles.sparkleButton} onPress={handleSend}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 4,
    width: 36,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
  },
  headerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  endCallButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallIconWrapper: {
    transform: [{ rotate: '135deg' }],
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
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
  inputContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 48,
  },
  translateButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  sparkleButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#0052FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
