import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/auth-context';
import { useApi } from '@/contexts/api-context';

export default function AccountScreen() {
  const { snapshot, signOut } = useAuth();
  const api = useApi();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const email = snapshot?.user.email || 'Not set';
  const createdAt = snapshot?.user.createdAt
    ? new Date(snapshot.user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      Alert.alert('Confirmation Required', 'Please type DELETE to confirm account deletion.');
      return;
    }

    setIsDeleting(true);
    try {
      // TODO: Implement deleteAccount API
      // await api.deleteAccount();
      Alert.alert(
        'Request Submitted',
        'Your account deletion request has been submitted. You will receive an email confirmation shortly.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowDeleteModal(false);
              signOut();
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      'For account-related inquiries, please email us at support@speakglass.com',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Account Info */}
        <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>
        <View style={styles.cardGroup}>
          <View style={[styles.listItem, styles.listItemFirst]}>
            <View style={styles.listItemContent}>
              <Text style={styles.listItemLabel}>Email</Text>
              <Text style={styles.listItemValueText}>{email}</Text>
            </View>
          </View>

          <View style={[styles.listItem, styles.listItemLast]}>
            <View style={styles.listItemContent}>
              <Text style={styles.listItemLabel}>Member since</Text>
              <Text style={styles.listItemValueText}>{createdAt}</Text>
            </View>
          </View>
        </View>

        {/* Subscription */}
        {snapshot?.billing && (
          <>
            <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
            <View style={styles.cardGroup}>
              <View style={[styles.listItem, styles.listItemFirst]}>
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemLabel}>Plan</Text>
                  <View style={styles.planRow}>
                    <Text style={styles.listItemValueText}>
                      {snapshot.billing.plan || 'Free'}
                    </Text>
                    {snapshot.billing.active && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {snapshot.billing.currentPeriodEnd && (
                <View style={[styles.listItem, styles.listItemLast]}>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemLabel}>
                      {snapshot.billing.cancelAtPeriodEnd ? 'Expires on' : 'Renews on'}
                    </Text>
                    <Text style={styles.listItemValueText}>
                      {new Date(snapshot.billing.currentPeriodEnd).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* Support */}
        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.cardGroup}>
          <TouchableOpacity
            style={[styles.listItem, styles.listItemFirst, styles.listItemLast]}
            onPress={handleContactSupport}
          >
            <Ionicons name="mail-outline" size={22} color="#666" />
            <Text style={styles.listItemText}>Contact Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <View style={styles.cardGroup}>
          <TouchableOpacity
            style={[styles.listItem, styles.listItemFirst, styles.listItemLast, styles.dangerItem]}
            onPress={() => setShowDeleteModal(true)}
          >
            <Ionicons name="trash-outline" size={22} color="#ff3b30" />
            <Text style={[styles.listItemText, styles.dangerText]}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.dangerInfo}>
          Deleting your account will permanently remove all your data including conversation history, 
          memories, and AI partners. This action cannot be undone.
        </Text>
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Delete Account</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.modalBody}>
              <View style={styles.warningIcon}>
                <Ionicons name="warning" size={48} color="#ff3b30" />
              </View>

              <Text style={styles.warningTitle}>Are you sure?</Text>
              <Text style={styles.warningText}>
                This will permanently delete your account and all associated data. This action cannot be undone.
              </Text>

              <Text style={styles.confirmLabel}>Type DELETE to confirm:</Text>
              <TextInput
                style={styles.confirmInput}
                placeholder="DELETE"
                placeholderTextColor="#ccc"
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  deleteConfirmText !== 'DELETE' && styles.deleteButtonDisabled,
                ]}
                onPress={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmText !== 'DELETE'}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonText}>Delete My Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 8,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  cardGroup: {
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
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
  listItemContent: {
    flex: 1,
  },
  listItemLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  listItemValueText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000',
  },
  listItemText: {
    flex: 1,
    fontSize: 17,
    color: '#000',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeBadge: {
    backgroundColor: '#34c759',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  dangerItem: {
    borderBottomWidth: 0,
  },
  dangerText: {
    color: '#ff3b30',
  },
  dangerInfo: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
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
    paddingBottom: 40,
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
    color: '#0052FF',
  },
  modalBody: {
    padding: 24,
    alignItems: 'center',
  },
  warningIcon: {
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  confirmLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  confirmInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    textAlign: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  deleteButton: {
    width: '100%',
    backgroundColor: '#ff3b30',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#ffb3b0',
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});

