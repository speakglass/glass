import { View, Text, StyleSheet, ScrollView, Image, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ConversationPartner } from '@glass/shared';

interface PartnerDetailProps {
  partner: ConversationPartner;
}

const relationshipLabels = {
  new_friends: 'New friends',
  someone_special: 'Someone special',
  professional: 'Professional practice',
  figuring_out: 'Still figuring it out',
};

const relationshipEmojis = {
  new_friends: '👋',
  someone_special: '💝',
  professional: '💼',
  figuring_out: '🤔',
};

const FALLBACK_AVATAR = require('@/assets/glass-ai.png');

const getAvatarSource = (avatarUrl?: string | null): ImageSourcePropType => {
  if (avatarUrl) {
    return { uri: avatarUrl };
  }
  return FALLBACK_AVATAR;
};

const buildLocation = (partner: ConversationPartner) => {
  const parts = [
    partner.personaCityTranslation || partner.personaCity,
    partner.personaCountryTranslation || partner.personaCountry,
  ].filter(Boolean);
  return parts.join(', ');
};

const parseInterests = (partner: ConversationPartner) => {
  const raw = partner.personaInterestsTranslation || partner.personaInterests;
  if (!raw) return [];
  return raw
    .split(/[,•]/)
    .map((interest) => interest.trim())
    .filter(Boolean);
};

const getRelationshipEmoji = (relationshipType?: string) => {
  if (!relationshipType) return '🤝';
  return relationshipEmojis[relationshipType as keyof typeof relationshipEmojis] || '🤝';
};

const getRelationshipLabel = (relationshipType?: string) => {
  if (!relationshipType) return null;
  return relationshipLabels[relationshipType as keyof typeof relationshipLabels] || relationshipType;
};

export default function PartnerDetail({ partner }: PartnerDetailProps) {
  const interests = parseInterests(partner);
  const location = buildLocation(partner);
  const relationshipType = partner.personaRelationship ?? undefined;

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Partner Avatar with Overlay */}
      <View style={styles.partnerAvatarContainer}>
        <Image source={getAvatarSource(partner.avatarUrl)} style={styles.partnerAvatarLarge} />

        {/* Gradient Overlay */}
        <LinearGradient colors={['transparent', 'rgba(0, 0, 0, 0.95)']} style={styles.avatarGradient}>
          <View style={styles.avatarOverlayContent}>
            {/* Name and Age */}
            <View style={styles.overlayHeader}>
              <Text style={styles.overlayName}>{partner.name}</Text>
              {partner.personaAge && <Text style={styles.overlayAge}>{partner.personaAge}</Text>}
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            </View>

            {/* Details */}
            <View style={styles.overlayDetails}>
              {(partner.nativeLang || partner.learningLang) && (
                <View style={styles.overlayDetailRow}>
                  <Ionicons name="language-outline" size={14} color="#fff" />
                  <Text style={styles.overlayDetailText}>
                    {partner.nativeLang || 'Native'} {partner.learningLang ? `→ ${partner.learningLang}` : ''}
                  </Text>
                </View>
              )}
              {partner.personaGender && (
                <View style={styles.overlayDetailRow}>
                  <Ionicons name="person-outline" size={14} color="#fff" />
                  <Text style={styles.overlayDetailText}>{partner.personaGender}</Text>
                </View>
              )}
              {partner.personaOccupation && (
                <View style={styles.overlayDetailRow}>
                  <Ionicons name="briefcase-outline" size={14} color="#fff" />
                  <Text style={styles.overlayDetailText}>
                    {partner.personaOccupationTranslation || partner.personaOccupation}
                  </Text>
                </View>
              )}
              {location && (
                <View style={styles.overlayDetailRow}>
                  <Ionicons name="location-outline" size={14} color="#fff" />
                  <Text style={styles.overlayDetailText}>{location}</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Content Section with Padding */}
      <View style={styles.contentSection}>
        {/* About Me */}
        <View style={styles.aboutMeSection}>
          <Text style={styles.aboutMeTitle}>About Me</Text>

          {(partner.descriptionTranslation || partner.description) && (
            <Text style={styles.aboutMeDescription}>
              {partner.descriptionTranslation || partner.description}
            </Text>
          )}

          {(partner.personaBackgroundTranslation || partner.personaBackground) && (
            <Text style={styles.aboutMeBackground}>
              {partner.personaBackgroundTranslation || partner.personaBackground}
            </Text>
          )}

          {/* Looking for */}
          {relationshipType && (
            <View style={styles.lookingForRow}>
              <Text style={styles.lookingForEmoji}>{getRelationshipEmoji(relationshipType)}</Text>
              <Text style={styles.lookingForLabel}>Looking for:</Text>
              <Text style={styles.lookingForValue}>{getRelationshipLabel(relationshipType)}</Text>
            </View>
          )}

          {interests.length > 0 && (
            <View style={styles.interestsBadges}>
              {interests.map((interest, idx) => (
                <View key={`${interest}-${idx}`} style={styles.interestBadge}>
                  <Text style={styles.interestBadgeText}>{interest}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    gap: 12,
    paddingBottom: 100,
  },
  partnerAvatarContainer: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  partnerAvatarLarge: {
    width: '100%',
    height: '100%',
  },
  avatarGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 24,
  },
  avatarOverlayContent: {
    gap: 8,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  overlayAge: {
    fontSize: 24,
    color: '#fff',
    opacity: 0.9,
  },
  overlayDetails: {
    gap: 4,
  },
  overlayDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayDetailText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.95,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0052FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentSection: {
    paddingHorizontal: 20,
    gap: 12,
  },
  lookingForRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lookingForEmoji: {
    fontSize: 18,
  },
  lookingForLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  lookingForValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  aboutMeSection: {
    gap: 8,
  },
  aboutMeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  aboutMeDescription: {
    fontSize: 16,
    color: '#000',
    lineHeight: 22,
  },
  aboutMeBackground: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  interestsBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  interestBadgeText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
});
