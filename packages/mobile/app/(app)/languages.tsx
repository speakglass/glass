import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/auth-context';
import { useApi } from '@/contexts/api-context';
import type { LearningLevel } from '@glass/shared';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: require('@/assets/us.png') },
  { code: 'ko', name: 'Korean', flag: require('@/assets/kr.png') },
  { code: 'es', name: 'Spanish', flag: require('@/assets/es.png') },
  { code: 'fr', name: 'French', flag: require('@/assets/fr.png') },
  { code: 'ja', name: 'Japanese', flag: require('@/assets/ja.png') },
];

const LEVELS: { id: LearningLevel; label: string; description: string }[] = [
  { id: 'zero', label: 'Zero', description: 'Starting from scratch' },
  { id: 'beginner', label: 'Beginner', description: 'Know basic phrases' },
  { id: 'intermediate', label: 'Intermediate', description: 'Can hold conversations' },
  { id: 'advanced', label: 'Advanced', description: 'Discuss complex topics' },
];

type SettingType = 'native' | 'learning' | 'level' | null;

export default function LanguagesScreen() {
  const { snapshot, refreshSnapshot } = useAuth();
  const api = useApi();

  const [editingType, setEditingType] = useState<SettingType>(null);
  const [selectedNative, setSelectedNative] = useState(snapshot?.user.nativeLang || 'en');
  const [selectedLearning, setSelectedLearning] = useState(snapshot?.user.learningLang || 'ko');
  const [selectedLevel, setSelectedLevel] = useState<LearningLevel>(
    (snapshot?.user.languageLevel as LearningLevel) || 'zero'
  );
  const [isSaving, setIsSaving] = useState(false);

  const getNativeLangName = () => {
    return LANGUAGES.find((l) => l.code === selectedNative)?.name || selectedNative?.toUpperCase();
  };

  const getLearningLangName = () => {
    return LANGUAGES.find((l) => l.code === selectedLearning)?.name || selectedLearning?.toUpperCase();
  };

  const getLevelLabel = () => {
    return LEVELS.find((l) => l.id === selectedLevel)?.label || selectedLevel;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateLanguageSettings({
        nativeLang: selectedNative,
        learningLang: selectedLearning,
        languageLevel: selectedLevel,
      });
      await refreshSnapshot();
      setEditingType(null);
      Alert.alert('Success', 'Language settings updated successfully!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const renderLanguageSelector = (type: 'native' | 'learning') => {
    const selected = type === 'native' ? selectedNative : selectedLearning;
    const setSelected = type === 'native' ? setSelectedNative : setSelectedLearning;
    const otherSelected = type === 'native' ? selectedLearning : selectedNative;

    return (
      <View style={styles.selectorContainer}>
        <View style={styles.selectorHeader}>
          <TouchableOpacity onPress={() => setEditingType(null)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#0052FF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.selectorTitle}>
            {type === 'native' ? 'I speak' : 'I want to learn'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.optionsList}>
          {LANGUAGES.map((lang) => {
            const isSelected = lang.code === selected;
            const isDisabled = lang.code === otherSelected;

            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.optionItem, isDisabled && styles.optionItemDisabled]}
                onPress={() => {
                  if (!isDisabled) {
                    setSelected(lang.code);
                  }
                }}
                disabled={isDisabled}
              >
                <Image source={lang.flag} style={styles.optionFlag} />
                <Text style={[styles.optionText, isDisabled && styles.optionTextDisabled]}>{lang.name}</Text>
                {isSelected && <Ionicons name="checkmark" size={24} color="#0052FF" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.selectorFooter}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderLevelSelector = () => {
    return (
      <View style={styles.selectorContainer}>
        <View style={styles.selectorHeader}>
          <TouchableOpacity onPress={() => setEditingType(null)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#0052FF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.selectorTitle}>My level</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.optionsList}>
          {LEVELS.map((level) => {
            const isSelected = level.id === selectedLevel;

            return (
              <TouchableOpacity
                key={level.id}
                style={styles.optionItem}
                onPress={() => setSelectedLevel(level.id)}
              >
                <View style={styles.levelInfo}>
                  <Text style={styles.optionText}>{level.label}</Text>
                  <Text style={styles.levelDescription}>{level.description}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark" size={24} color="#0052FF" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.selectorFooter}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (editingType === 'native' || editingType === 'learning') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderLanguageSelector(editingType)}
      </SafeAreaView>
    );
  }

  if (editingType === 'level') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderLevelSelector()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Languages</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Native Language */}
        <View style={styles.cardGroup}>
          <TouchableOpacity
            style={[styles.listItem, styles.listItemFirst, styles.listItemLast]}
            onPress={() => setEditingType('native')}
          >
            <View style={styles.listItemContent}>
              <Text style={styles.listItemLabel}>I speak</Text>
              <View style={styles.listItemValue}>
                <Image
                  source={LANGUAGES.find((l) => l.code === selectedNative)?.flag}
                  style={styles.smallFlag}
                />
                <Text style={styles.listItemValueText}>{getNativeLangName()}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Learning Language */}
        <View style={styles.cardGroup}>
          <TouchableOpacity
            style={[styles.listItem, styles.listItemFirst]}
            onPress={() => setEditingType('learning')}
          >
            <View style={styles.listItemContent}>
              <Text style={styles.listItemLabel}>I want to learn</Text>
              <View style={styles.listItemValue}>
                <Image
                  source={LANGUAGES.find((l) => l.code === selectedLearning)?.flag}
                  style={styles.smallFlag}
                />
                <Text style={styles.listItemValueText}>{getLearningLangName()}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listItem, styles.listItemLast]}
            onPress={() => setEditingType('level')}
          >
            <View style={styles.listItemContent}>
              <Text style={styles.listItemLabel}>My level</Text>
              <Text style={styles.listItemValueText}>{getLevelLabel()}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Ionicons name="information-circle-outline" size={18} color="#666" />
          <Text style={styles.infoText}>
            Your language settings affect how Glass AI partners communicate with you and provide feedback.
          </Text>
        </View>
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
    paddingVertical: 16,
  },
  cardGroup: {
    marginHorizontal: 16,
    marginBottom: 16,
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
  listItemValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listItemValueText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000',
  },
  smallFlag: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  // Selector styles
  selectorContainer: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontSize: 17,
    color: '#0052FF',
  },
  selectorTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  optionsList: {
    flex: 1,
    backgroundColor: '#fff',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  optionItemDisabled: {
    opacity: 0.4,
  },
  optionFlag: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 14,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  optionText: {
    flex: 1,
    fontSize: 17,
    color: '#000',
  },
  optionTextDisabled: {
    color: '#999',
  },
  levelInfo: {
    flex: 1,
  },
  levelDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  selectorFooter: {
    padding: 16,
    paddingBottom: 20,
    backgroundColor: '#f0f0f0',
  },
  saveButton: {
    backgroundColor: '#0052FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});

