import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Animated } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import type { LearningLevel } from '@glass/shared';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
];

const LEVELS: { value: LearningLevel; label: string; subtitle: string; icon: string }[] = [
  {
    value: 'zero',
    label: 'Zero',
    subtitle: 'Starting from scratch',
    icon: '🥚',
  },
  {
    value: 'beginner',
    label: 'Beginner',
    subtitle: 'Know basic phrases',
    icon: '🌱',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    subtitle: 'Can hold conversations',
    icon: '🌼',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    subtitle: 'Discuss complex topics',
    icon: '🌟',
  },
];

export default function OnboardingScreen() {
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(1);
  const [learningLang, setLearningLang] = useState('');
  const [nativeLang, setNativeLang] = useState('');
  const [level, setLevel] = useState<LearningLevel | ''>('');
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!learningLang || !nativeLang || !level) {
      Alert.alert('Error', 'Please complete all steps');
      return;
    }

    setLoading(true);
    try {
      await completeOnboarding({
        learningLang,
        nativeLang,
        languageLevel: level,
      });
      router.replace('/(app)/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Glass!</Text>

          <View style={styles.steps}>
            <View style={[styles.step, step >= 1 && styles.stepActive]}>
              <Text style={[styles.stepNumber, step >= 1 && styles.stepNumberActive]}>1</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={[styles.step, step >= 2 && styles.stepActive]}>
              <Text style={[styles.stepNumber, step >= 2 && styles.stepNumberActive]}>2</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={[styles.step, step >= 3 && styles.stepActive]}>
              <Text style={[styles.stepNumber, step >= 3 && styles.stepNumberActive]}>3</Text>
            </View>
          </View>
        </View>

        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your native language?</Text>
            <View style={styles.options}>
              {LANGUAGES.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={({ pressed }) => [
                    styles.option,
                    nativeLang === lang.code && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                  onPress={() => {
                    setNativeLang(lang.code);
                    setTimeout(() => setStep(2), 150);
                  }}
                >
                  <Text style={styles.optionFlag}>{lang.flag}</Text>
                  <Text style={[styles.optionText, nativeLang === lang.code && styles.optionTextSelected]}>
                    {lang.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What language are you learning?</Text>
            <View style={styles.options}>
              {LANGUAGES.map((lang) => {
                const isDisabled = lang.code === nativeLang;
                return (
                  <Pressable
                    key={lang.code}
                    style={({ pressed }) => [
                      styles.option,
                      learningLang === lang.code && styles.optionSelected,
                      isDisabled && styles.optionDisabled,
                      !isDisabled && pressed && styles.optionPressed,
                    ]}
                    onPress={() => {
                      if (!isDisabled) {
                        setLearningLang(lang.code);
                        setTimeout(() => setStep(3), 150);
                      }
                    }}
                    disabled={isDisabled}
                  >
                    <Text style={[styles.optionFlag, isDisabled && styles.optionFlagDisabled]}>{lang.flag}</Text>
                    <Text
                      style={[
                        styles.optionText,
                        learningLang === lang.code && styles.optionTextSelected,
                        isDisabled && styles.optionTextDisabled,
                      ]}
                    >
                      {lang.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              onPress={() => setStep(1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your current level?</Text>
            <View style={styles.options}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.value}
                  style={({ pressed }) => [
                    styles.levelOption,
                    level === l.value && styles.levelOptionSelected,
                    pressed && styles.levelOptionPressed,
                  ]}
                  onPress={() => setLevel(l.value)}
                >
                  <Text style={styles.levelIcon}>{l.icon}</Text>
                  <View style={styles.levelTextContainer}>
                    <Text style={[styles.levelLabel, level === l.value && styles.levelLabelSelected]}>{l.label}</Text>
                    <Text style={[styles.levelSubtitle, level === l.value && styles.levelSubtitleSelected]}>
                      {l.subtitle}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.completeButton,
                (!level || loading) && styles.buttonDisabled,
                pressed && !loading && level && styles.completeButtonPressed,
              ]}
              onPress={handleComplete}
              disabled={!level || loading}
            >
              <Text style={styles.completeButtonText}>{loading ? 'Completing...' : 'Get Started'}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              onPress={() => setStep(2)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepActive: {
    backgroundColor: '#0052FF',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: '#f0f0f0',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 32,
    textAlign: 'center',
  },
  options: {
    gap: 12,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    gap: 10,
  },
  optionSelected: {
    borderColor: '#0052FF',
    backgroundColor: '#E8F4FF',
  },
  optionPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.8,
  },
  optionDisabled: {
    opacity: 0.4,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  optionFlag: {
    fontSize: 22,
  },
  optionFlagDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#0052FF',
    fontWeight: '600',
  },
  optionTextDisabled: {
    color: '#999',
  },
  levelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    gap: 12,
  },
  levelOptionSelected: {
    borderColor: '#0052FF',
    backgroundColor: '#E8F4FF',
  },
  levelOptionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  levelIcon: {
    fontSize: 28,
  },
  levelTextContainer: {
    flex: 1,
  },
  levelLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  levelLabelSelected: {
    color: '#0052FF',
  },
  levelSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  levelSubtitleSelected: {
    color: '#0052FF',
    opacity: 0.8,
  },
  completeButton: {
    height: 50,
    backgroundColor: '#0052FF',
    borderRadius: 12,
    marginTop: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  backButton: {
    height: 44,
    marginTop: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  backButtonText: {
    color: '#0052FF',
    fontSize: 15,
    fontWeight: '600',
  },
});
