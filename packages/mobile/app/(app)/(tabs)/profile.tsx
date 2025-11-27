import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
  Image,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Href } from 'expo-router';

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

export default function SettingsScreen() {
  const { user, snapshot, signOut } = useAuth();

  const nativeFlag = getFlagSource(snapshot?.user.nativeLang);
  const learningFlag = getFlagSource(snapshot?.user.learningLang);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  const handleHelp = () => {
    Alert.alert('Help & Support', 'How would you like to get help?', [
      {
        text: 'Email Support',
        onPress: () => {
          Linking.openURL('mailto:support@speakglass.com?subject=Glass%20App%20Support').catch(() =>
            Alert.alert('Error', 'Unable to open email app')
          );
        },
      },
      {
        text: 'Visit Help Center',
        onPress: () => {
          Linking.openURL('https://discord.gg/HUb3M8HZ').catch(() => Alert.alert('Error', 'Unable to open browser'));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleTellFriend = async () => {
    try {
      const result = await Share.share({
        message: 'Check out Glass - Learn languages through real conversations with AI partners! 🌍✨',
        title: 'Try Glass',
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // Shared with activity type
        } else {
          // Shared
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to share');
    }
  };

  const handleAccount = () => {
    router.push('/(app)/account' as Href);
  };

  const handleLanguages = () => {
    router.push('/(app)/languages' as Href);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
          <Text style={styles.searchPlaceholder}>Search</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.cardGroup}>
          <Pressable style={styles.profileCard}>
            <View
              style={[styles.profileAvatar, { backgroundColor: getAvatarColor(user?.name || snapshot?.user.name) }]}
            >
              <Text style={styles.avatarInitials}>{getInitials(user?.name || snapshot?.user.name)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || snapshot?.user.name || 'User'}</Text>
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
          </Pressable>
        </View>

        {/* Main Settings Group */}
        <View style={styles.cardGroup}>
          <TouchableOpacity style={[styles.listItem, styles.listItemFirst]} onPress={handleAccount}>
            <Ionicons name="key" size={22} color="#666" />
            <Text style={styles.listItemText}>Account</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.listItem} onPress={handleLanguages}>
            <Ionicons name="language" size={22} color="#666" />
            <Text style={styles.listItemText}>Languages</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listItem, styles.listItemLast]}
            onPress={() => router.push('/(app)/(tabs)/memory' as Href)}
          >
            <Ionicons name="bulb-outline" size={22} color="#666" />
            <Text style={styles.listItemText}>Memory</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          {/* {snapshot?.billing && (
            <TouchableOpacity style={[styles.listItem, styles.listItemLast]}>
              <Ionicons name="card" size={22} color="#666" />
              <Text style={styles.listItemText}>Subscription</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          )} */}
        </View>

        {/* Help Group */}
        <View style={styles.cardGroup}>
          <TouchableOpacity style={[styles.listItem, styles.listItemFirst]} onPress={handleHelp}>
            <Ionicons name="help-circle" size={22} color="#666" />
            <Text style={styles.listItemText}>Help</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.listItem, styles.listItemLast]} onPress={handleTellFriend}>
            <Ionicons name="heart" size={22} color="#666" />
            <Text style={styles.listItemText}>Tell a Friend</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Sign Out Group */}
        <View style={styles.cardGroup}>
          <TouchableOpacity
            style={[styles.listItem, styles.listItemFirst, styles.listItemLast]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out" size={22} color="#ff3b30" />
            <Text style={[styles.listItemText, styles.signOutText]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Glass version 0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
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
    backgroundColor: '#f0f0f0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
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
  cardGroup: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  profileAvatar: {
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
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  profileStatus: {
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
  qrButton: {
    padding: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    gap: 14,
  },
  listItemFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  listItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  brainEmoji: {
    fontSize: 22,
    width: 22,
    textAlign: 'center',
  },
  signOutText: {
    color: '#ff3b30',
  },
  version: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    paddingVertical: 20,
  },
});
