import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useApi } from '@/contexts/api-context';
import { useAuth } from '@/contexts/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import type { ConversationPartner, PartnerGenerationJob, PartnerGenerationStatus } from '@glass/shared';
import PartnerDetail from '@/components/PartnerDetail';

type Step = 'topics' | 'partner_type' | 'basics' | 'creating' | 'complete';

type PartnerType = 'new_friends' | 'someone_special' | 'professional' | 'figuring_out';
type GenderPreference = 'male' | 'female' | 'beyond_binary' | 'everyone';
type AgePreference = 'teens' | 'early20s' | 'late20s' | 'thirties' | 'forties' | 'any';

// Universal topics that work for all languages (from web)
const universalTopics = [
  { id: 'daily_life', icon: '☀️', title: 'Daily life' },
  { id: 'travel', icon: '✈️', title: 'Travel' },
  { id: 'food', icon: '🍜', title: 'Food & Cooking' },
  { id: 'movies_tv', icon: '🎬', title: 'Movies & TV' },
  { id: 'music', icon: '🎵', title: 'Music' },
  { id: 'sports', icon: '⚽', title: 'Sports' },
];

// Language-specific topics (from web)
const languageSpecificTopics: Record<string, Array<{ id: string; icon: string; title: string }>> = {
  en: [
    { id: 'pop_culture', icon: '🎬', title: 'Pop culture' },
    { id: 'tech_startups', icon: '💻', title: 'Tech & Startups' },
    { id: 'american_culture', icon: '🗽', title: 'American culture' },
    { id: 'british_culture', icon: '☕', title: 'British culture' },
    { id: 'entertainment', icon: '🎭', title: 'Entertainment' },
  ],
  ko: [
    { id: 'kpop', icon: '🎤', title: 'K-pop' },
    { id: 'kdrama', icon: '📺', title: 'K-drama' },
    { id: 'korean_food', icon: '🍲', title: 'Korean food' },
    { id: 'korean_culture', icon: '🏯', title: 'Korean culture' },
    { id: 'kbeauty', icon: '💄', title: 'K-beauty' },
  ],
  ja: [
    { id: 'anime', icon: '🎌', title: 'Anime' },
    { id: 'manga', icon: '📖', title: 'Manga' },
    { id: 'japanese_food', icon: '🍣', title: 'Japanese food' },
    { id: 'japanese_culture', icon: '⛩️', title: 'Japanese culture' },
    { id: 'jrpg', icon: '🎮', title: 'Video games' },
  ],
  es: [
    { id: 'latino_music', icon: '💃', title: 'Latino music' },
    { id: 'football', icon: '⚽', title: 'Football' },
    { id: 'spanish_food', icon: '🥘', title: 'Spanish cuisine' },
    { id: 'latin_culture', icon: '🎊', title: 'Latin culture' },
    { id: 'telenovela', icon: '📺', title: 'Telenovelas' },
  ],
  fr: [
    { id: 'french_cuisine', icon: '🥐', title: 'French cuisine' },
    { id: 'wine', icon: '🍷', title: 'Wine & Cheese' },
    { id: 'french_cinema', icon: '🎬', title: 'French cinema' },
    { id: 'fashion', icon: '👗', title: 'Fashion' },
    { id: 'art', icon: '🎨', title: 'Art & Museums' },
  ],
};

const getConversationTopics = (learningLang?: string) => {
  const specificTopics = learningLang ? languageSpecificTopics[learningLang] || [] : [];
  return [...universalTopics, ...specificTopics];
};

const PARTNER_TYPES = [
  {
    id: 'new_friends' as PartnerType,
    icon: '👋',
    title: 'New friends',
    description: 'Make connections and have fun conversations',
  },
  {
    id: 'someone_special' as PartnerType,
    icon: '💝',
    title: 'Someone special',
    description: 'Warm and meaningful connections',
  },
  {
    id: 'professional' as PartnerType,
    icon: '💼',
    title: 'Professional',
    description: 'Business and workplace language',
  },
  { id: 'figuring_out' as PartnerType, icon: '🤔', title: 'Still exploring', description: 'Try different styles' },
];

const GENDERS = [
  { id: 'male' as GenderPreference, label: 'Male', icon: '👨' },
  { id: 'female' as GenderPreference, label: 'Female', icon: '👩' },
  { id: 'beyond_binary' as GenderPreference, label: 'Beyond Binary', icon: '🌈' },
  { id: 'everyone' as GenderPreference, label: 'Any' },
];

const AGES = [
  { id: 'teens' as AgePreference, label: 'Teens' },
  { id: 'early20s' as AgePreference, label: 'Early 20s' },
  { id: 'late20s' as AgePreference, label: 'Late 20s' },
  { id: 'thirties' as AgePreference, label: '30s' },
  { id: 'forties' as AgePreference, label: '40+' },
  { id: 'any' as AgePreference, label: 'Any' },
];

const PARTNER_IMAGES = [
  require('@/assets/partners/alex.png'),
  require('@/assets/partners/camila.png'),
  require('@/assets/partners/claire.png'),
  require('@/assets/partners/diego.png'),
  require('@/assets/partners/emma.png'),
  require('@/assets/partners/haruto.png'),
  require('@/assets/partners/jiwoo.png'),
  require('@/assets/partners/liwei.png'),
  require('@/assets/partners/luc.png'),
  require('@/assets/partners/mei.png'),
  require('@/assets/partners/minjun.png'),
  require('@/assets/partners/yui.png'),
];

const PROGRESS_STEPS = [
  { id: 'persona', label: 'Finding a great match', icon: '🔍' },
  { id: 'voice', label: 'Sending a match request', icon: '💬' },
  { id: 'partner', label: 'Getting their story', icon: '📝' },
  { id: 'avatar', label: 'Grabbing a friendly photo', icon: '📸' },
  { id: 'complete', label: 'Final touches', icon: '✨' },
];

// Dynamic completed labels will be generated based on persona data
const getStepCompletedLabel = (stepId: string, name?: string, location?: string): string => {
  switch (stepId) {
    case 'persona':
      return location ? `Found someone promising in ${location}.` : 'Found someone who shares your interests.';
    case 'voice':
      return name ? `${name} just accepted the match request.` : 'Your match just said yes.';
    case 'partner':
      return name ? `${name} shared their story.` : 'Got their story!';
    case 'avatar':
      return name ? `${name} shared their photo.` : 'Got their photo!';
    case 'complete':
      return 'All set!';
    default:
      return 'Done!';
  }
};

const STATUS_MESSAGES: Record<PartnerGenerationStatus, string> = {
  queued: 'Finding a great match...',
  generating_persona: 'Writing their story...',
  selecting_voice: 'Picking the perfect voice...',
  saving_partner: 'Saving your partner...',
  generating_avatar: 'Grabbing a friendly photo...',
  completed: 'Partner ready!',
  failed: 'Unable to finish',
};

export default function NewPartnerScreen() {
  const api = useApi();
  const { snapshot } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('topics');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [partnerType, setPartnerType] = useState<PartnerType>('new_friends');
  const [gender, setGender] = useState<GenderPreference>('everyone');
  const [age, setAge] = useState<AgePreference>('late20s');
  const [isCreating, setIsCreating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [createdPartner, setCreatedPartner] = useState<ConversationPartner | null>(null);
  const [job, setJob] = useState<PartnerGenerationJob | null>(null);
  const customInputRef = useRef<TextInput>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const learningLang = snapshot?.user.learningLang || undefined;
  const nativeLang = snapshot?.user.nativeLang || undefined;
  const languageLevel = snapshot?.user.languageLevel || undefined;
  const availableTopics = useMemo(() => getConversationTopics(learningLang), [learningLang]);

  const updateProgressFromJob = useCallback((nextJob: PartnerGenerationJob | null) => {
    if (!nextJob) {
      setCurrentStepIndex(0);
      return;
    }
    if (nextJob.status === 'completed') {
      setCurrentStepIndex(PROGRESS_STEPS.length - 1);
      return;
    }
    const indexes =
      nextJob.stepsCompleted
        ?.map((stepId) => PROGRESS_STEPS.findIndex((step) => step.id === stepId))
        .filter((idx) => idx >= 0) || [];
    if (indexes.length > 0) {
      setCurrentStepIndex(Math.max(...indexes));
    } else {
      setCurrentStepIndex(0);
    }
  }, []);

  const finalizeJob = useCallback(
    (finishedJob: PartnerGenerationJob) => {
      const partner = finishedJob.partner;
      if (!partner) {
        Alert.alert('Partner created', 'Your new partner will appear soon. Please refresh in a moment.');
        setIsCreating(false);
        setStep('partner_type');
        setJob(null);
        return;
      }
      setCreatedPartner(partner);
      setStep('complete');
      setIsCreating(false);
      setCurrentStepIndex(PROGRESS_STEPS.length - 1);
      queryClient.invalidateQueries({ queryKey: ['partners'] });
    },
    [queryClient]
  );

  // Carousel animation
  useEffect(() => {
    if (step === 'creating') {
      const animation = Animated.loop(
        Animated.timing(scrollX, {
          toValue: -1000,
          duration: 20000,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => animation.stop();
    }
  }, [step, scrollX]);

  useEffect(() => {
    if (!job) return;
    updateProgressFromJob(job);
    if (job.status === 'completed') {
      finalizeJob(job);
    } else if (job.status === 'failed') {
      setIsCreating(false);
      setStep('basics');
      setJob(null);
      setCurrentStepIndex(0);
      Alert.alert('Unable to create partner', job.error || 'Please try again later.');
    }
  }, [job, finalizeJob, updateProgressFromJob]);

  useEffect(() => {
    if (!job?.id) return;
    if (job.status === 'completed' || job.status === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const next = await api.fetchPartnerGenerationJob(job.id);
        setJob(next);
      } catch (err) {
        console.error('Failed to poll partner generation job', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [job?.id, job?.status, api]);

  const toggleTopic = (topicId: string) => {
    setSelectedTopics((prev) => (prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]));
  };

  const addCustomTopic = () => {
    const trimmed = customTopicInput.trim();
    if (trimmed) {
      if (!customTopics.includes(trimmed)) {
        setCustomTopics((prev) => [...prev, trimmed]);
      }
      setCustomTopicInput('');
      setShowCustomInput(false);
    }
  };

  const removeCustomTopic = (topic: string) => {
    setCustomTopics((prev) => prev.filter((t) => t !== topic));
  };

  const handleNext = () => {
    if (step === 'topics' && selectedTopics.length > 0) {
      setStep('partner_type');
    } else if (step === 'partner_type') {
      setStep('basics');
    } else if (step === 'basics') {
      handleCreate();
    }
  };

  const handleCreate = async () => {
    const mergedTopics = [
      ...availableTopics.filter((topic) => selectedTopics.includes(topic.id)).map((topic) => topic.title),
      ...customTopics,
    ]
      .map((topic) => topic.trim())
      .filter(Boolean);

    if (mergedTopics.length === 0) {
      Alert.alert('Add at least one topic', 'Tell us what you want to talk about.');
      return;
    }

    if (snapshot?.limits?.partners?.blocked) {
      Alert.alert(
        'Partner limit reached',
        'You have reached the maximum number of AI partners for your plan. Remove one to create a new partner.'
      );
      return;
    }

    setStep('creating');
    setIsCreating(true);
    setCurrentStepIndex(0);
    setCreatedPartner(null);
    setJob(null);

    try {
      const jobResponse = await api.startPartnerGeneration({
        learningLang,
        nativeLang,
        languageLevel,
        topics: mergedTopics,
        partnerType,
        gender,
        ageRange: age === 'any' ? 'late20s' : age,
      });
      setJob(jobResponse);
      updateProgressFromJob(jobResponse);
      if (jobResponse.status === 'completed') {
        finalizeJob(jobResponse);
      }
    } catch (error) {
      console.error('Failed to start partner generation', error);
      setIsCreating(false);
      setStep('basics');
      Alert.alert('Unable to create partner', error instanceof Error ? error.message : 'Please try again later.');
    }
  };

  const handleComplete = () => {
    // Navigate to Partners tab to show the new partner in the list
    router.replace('/(app)/(tabs)/partners' as Href);
  };

  const handleFindAnother = () => {
    // Reset to start
    setStep('topics');
    setSelectedTopics([]);
    setCustomTopics([]);
    setPartnerType('new_friends');
    setGender('everyone');
    setAge('late20s');
    setCreatedPartner(null);
    setJob(null);
    setCurrentStepIndex(0);
    setIsCreating(false);
  };

  const canProceed = () => {
    if (step === 'topics') return selectedTopics.length > 0 || customTopics.length > 0;
    return true;
  };

  const getProgressPercentage = () => {
    switch (step) {
      case 'topics':
        return 33;
      case 'partner_type':
        return 66;
      case 'basics':
        return 100;
      default:
        return 100;
    }
  };

  const renderTopics = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Passions</Text>
      <Text style={styles.stepSubtitle}>Let everyone know what you're passionate about</Text>

      <View style={styles.topicsList}>
        {availableTopics.map((topic) => (
          <Pressable
            key={topic.id}
            style={[styles.topicBadge, selectedTopics.includes(topic.id) && styles.topicBadgeSelected]}
            onPress={() => toggleTopic(topic.id)}
          >
            <Text style={styles.topicBadgeIcon}>{topic.icon}</Text>
            <Text style={[styles.topicBadgeText, selectedTopics.includes(topic.id) && styles.topicBadgeTextSelected]}>
              {topic.title}
            </Text>
          </Pressable>
        ))}

        {customTopics.map((topic) => (
          <View key={topic} style={[styles.topicBadge, styles.topicBadgeSelected]}>
            <Text style={styles.topicBadgeTextSelected}>{topic}</Text>
            <TouchableOpacity onPress={() => removeCustomTopic(topic)} style={styles.removeButton}>
              <Ionicons name="close-circle" size={16} color="#0052FF" />
            </TouchableOpacity>
          </View>
        ))}

        {!showCustomInput ? (
          <Pressable
            style={styles.addCustomBadge}
            onPress={() => {
              setShowCustomInput(true);
              setTimeout(() => customInputRef.current?.focus(), 100);
            }}
          >
            <Ionicons name="add" size={20} color="#666" />
            <Text style={styles.addCustomText}>Add custom</Text>
          </Pressable>
        ) : (
          <View style={styles.customInputContainer}>
            <TextInput
              ref={customInputRef}
              style={styles.customInput}
              value={customTopicInput}
              onChangeText={setCustomTopicInput}
              placeholder="Type a topic..."
              placeholderTextColor="#999"
              autoFocus
              onSubmitEditing={() => {
                addCustomTopic();
              }}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <TouchableOpacity onPress={addCustomTopic} style={styles.addButton}>
              <Ionicons name="checkmark" size={20} color="#0052FF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowCustomInput(false);
                setCustomTopicInput('');
              }}
              style={styles.cancelButton}
            >
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {(selectedTopics.length > 0 || customTopics.length > 0) && (
        <Text style={styles.selectedCount}>{selectedTopics.length + customTopics.length} selected</Text>
      )}
    </View>
  );

  const renderPartnerType = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What kind of partner?</Text>
      <Text style={styles.stepSubtitle}>Choose your conversation style</Text>

      <View style={styles.partnerTypesContainer}>
        {PARTNER_TYPES.map((type) => (
          <Pressable
            key={type.id}
            style={({ pressed }) => [
              styles.partnerTypeOption,
              partnerType === type.id && styles.partnerTypeOptionSelected,
              pressed && styles.partnerTypeOptionPressed,
            ]}
            onPress={() => setPartnerType(type.id)}
          >
            <Text style={styles.partnerTypeIcon}>{type.icon}</Text>
            <View style={styles.partnerTypeInfo}>
              <Text style={styles.partnerTypeTitle}>{type.title}</Text>
              <Text style={styles.partnerTypeDescription}>{type.description}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderBasics = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Last step!</Text>
      <Text style={styles.stepSubtitle}>Tell us your preferences</Text>

      {/* Gender */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceLabel}>Gender</Text>
        <View style={styles.topicsList}>
          {GENDERS.map((g) => (
            <Pressable
              key={g.id}
              style={[styles.topicBadge, gender === g.id && styles.topicBadgeSelected]}
              onPress={() => setGender(g.id)}
            >
              {'icon' in g && g.icon && <Text style={styles.topicBadgeIcon}>{g.icon}</Text>}
              <Text style={[styles.topicBadgeText, gender === g.id && styles.topicBadgeTextSelected]}>{g.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Age */}
      <View style={styles.preferenceSection}>
        <Text style={styles.preferenceLabel}>Age Range</Text>
        <View style={styles.topicsList}>
          {AGES.map((a) => (
            <Pressable
              key={a.id}
              style={[styles.topicBadge, age === a.id && styles.topicBadgeSelected]}
              onPress={() => setAge(a.id)}
            >
              <Text style={[styles.topicBadgeText, age === a.id && styles.topicBadgeTextSelected]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  const renderCreating = () => {
    const displayIndex = Math.min(currentStepIndex, PROGRESS_STEPS.length - 1);
    const currentStepLabel = PROGRESS_STEPS[displayIndex].label;

    // Get dynamic info from personaPreview or partner
    const persona = job?.personaPreview;
    const partner = job?.partner;
    const name = partner?.name || persona?.name;
    const city = persona?.personaCityTranslation || persona?.personaCity;
    const country = persona?.personaCountryTranslation || persona?.personaCountry;
    const location = [city, country].filter(Boolean).join(', ');

    // Generate dynamic status messages based on current step and available data
    const getDynamicMessage = () => {
      const stepId = PROGRESS_STEPS[displayIndex].id;

      switch (stepId) {
        case 'persona':
          return location
            ? `Looking around ${location} for an AI partner to chat with...`
            : 'Meeting potential AI partners...';
        case 'voice':
          return 'Sending a match request to our AI partner...';
        case 'partner':
          return name ? `${name} is putting together a quick profile for you...` : 'Getting their story...';
        case 'avatar':
          return name
            ? `${name} is picking a friendly photo to share...`
            : 'Your partner is picking a friendly photo...';
        case 'complete':
          return name ? `All set! ${name} is ready to chat.` : 'Ready to say hi!';
        default:
          return 'Looking for an AI partner who matches your vibe...';
      }
    };

    const statusMessage = job?.message || getDynamicMessage();

    return (
      <View style={styles.findingContainer}>
        {/* Title */}
        <Text style={styles.findingTitle}>{currentStepLabel}</Text>
        <Text style={styles.findingSubtitle}>{statusMessage}</Text>

        {/* Animated Partner Images Carousel */}
        <View style={styles.carouselContainer}>
          <Animated.View style={[styles.carouselTrack, { transform: [{ translateX: scrollX }] }]}>
            {[...PARTNER_IMAGES, ...PARTNER_IMAGES].map((image, idx) => (
              <View key={idx} style={styles.partnerImageWrapper}>
                <Image source={image} style={styles.partnerImage} />
              </View>
            ))}
          </Animated.View>
          {/* Gradient Overlays */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 1)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientLeft}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientRight}
            pointerEvents="none"
          />
        </View>

        {/* Progress Steps */}
        <View style={styles.progressSteps}>
          {PROGRESS_STEPS.map((stepItem, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;

            // Get dynamic persona info
            const persona = job?.personaPreview;
            const partner = job?.partner;
            const name = partner?.name || persona?.name;
            const city = persona?.personaCityTranslation || persona?.personaCity;
            const country = persona?.personaCountryTranslation || persona?.personaCountry;
            const location = [city, country].filter(Boolean).join(', ');

            const displayLabel = isCompleted
              ? getStepCompletedLabel(stepItem.id, name || undefined, location || undefined)
              : stepItem.label;

            return (
              <View
                key={stepItem.id}
                style={[
                  styles.progressStep,
                  isActive && styles.progressStepActive,
                  isCompleted && styles.progressStepCompleted,
                ]}
              >
                <View style={styles.progressStepIcon}>
                  {isCompleted ? (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  ) : isActive ? (
                    <View style={styles.loadingCircle}>
                      <ActivityIndicator size="small" color="#0052FF" />
                    </View>
                  ) : (
                    <View style={styles.waitingCircle}>
                      <Text style={styles.stepEmoji}>{stepItem.icon}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.progressStepLabel,
                    isActive && styles.progressStepLabelActive,
                    isCompleted && styles.progressStepLabelCompleted,
                  ]}
                >
                  {displayLabel}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderComplete = () => {
    if (!createdPartner) return null;

    return (
      <View style={styles.completeWrapper}>
        <PartnerDetail partner={createdPartner} />

        {/* Fixed Bottom Buttons */}
        <View style={styles.completeButtonsContainer}>
          <TouchableOpacity style={styles.findAnotherButton} onPress={handleFindAnother}>
            <Text style={styles.findAnotherButtonText}>Keep Looking</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.startChatButton} onPress={handleComplete}>
            <Text style={styles.startChatButtonText}>Say Hi</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New AI Partner</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Progress Bar */}
      {step !== 'creating' && step !== 'complete' && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${getProgressPercentage()}%` }]} />
          </View>
        </View>
      )}

      {/* Content */}
      {step === 'complete' ? (
        renderComplete()
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {step === 'topics' && renderTopics()}
          {step === 'partner_type' && renderPartnerType()}
          {step === 'basics' && renderBasics()}
          {step === 'creating' && renderCreating()}
        </ScrollView>
      )}

      {/* Footer */}
      {step !== 'creating' && step !== 'complete' && (
        <View style={styles.footer}>
          {step !== 'topics' && (
            <TouchableOpacity
              style={styles.backTextButton}
              onPress={() => {
                if (step === 'partner_type') setStep('topics');
                else if (step === 'basics') setStep('partner_type');
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#0052FF" />
              <Text style={styles.backTextButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.nextButton, !canProceed() && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!canProceed()}
          >
            <Text style={styles.nextButtonText}>{step === 'basics' ? 'Create Partner' : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  progressBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0052FF',
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  topicsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  topicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  topicBadgeSelected: {
    backgroundColor: '#fff',
    borderColor: '#0052FF',
  },
  topicBadgeIcon: {
    fontSize: 16,
  },
  topicBadgeText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  topicBadgeTextSelected: {
    fontSize: 15,
    color: '#0052FF',
    fontWeight: '600',
  },
  removeButton: {
    marginLeft: 4,
  },
  addCustomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    gap: 6,
  },
  addCustomText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#0052FF',
    gap: 8,
    minWidth: 180,
  },
  customInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 100,
  },
  addButton: {
    padding: 2,
  },
  cancelButton: {
    padding: 2,
  },
  selectedCount: {
    fontSize: 13,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  partnerTypesContainer: {
    gap: 12,
  },
  partnerTypeOption: {
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
  partnerTypeOptionSelected: {
    borderColor: '#0052FF',
    backgroundColor: '#E8F4FF',
  },
  partnerTypeOptionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  partnerTypeIcon: {
    fontSize: 28,
  },
  partnerTypeInfo: {
    flex: 1,
  },
  partnerTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  partnerTypeDescription: {
    fontSize: 13,
    color: '#666',
  },
  preferenceSection: {
    marginTop: 24,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  findingContainer: {
    flex: 1,
    paddingVertical: 40,
    gap: 32,
  },
  findingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  findingSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  carouselContainer: {
    height: 100,
    position: 'relative',
    overflow: 'hidden',
  },
  carouselTrack: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
  },
  partnerImageWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  partnerImage: {
    width: '100%',
    height: '100%',
  },
  gradientLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 100,
  },
  gradientRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
  },
  progressSteps: {
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    gap: 8,
    paddingHorizontal: 20,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  progressStepActive: {
    backgroundColor: 'rgba(0, 82, 255, 0.05)',
  },
  progressStepCompleted: {
    opacity: 0.6,
  },
  progressStepIcon: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 82, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepEmoji: {
    fontSize: 12,
  },
  progressStepLabel: {
    flex: 1,
    fontSize: 16,
    color: '#999',
  },
  progressStepLabelActive: {
    color: '#000',
    fontWeight: '600',
  },
  progressStepLabelCompleted: {
    color: '#666',
  },
  completeWrapper: {
    flex: 1,
  },
  completeButtonsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    flexDirection: 'row',
    gap: 12,
  },
  findAnotherButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  findAnotherButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  startChatButton: {
    flex: 1,
    backgroundColor: '#0052FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  startChatButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  backTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backTextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0052FF',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#0052FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#d0d0d0',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
