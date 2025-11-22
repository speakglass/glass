import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { toast } from 'sonner';
import { cn } from '@/utils';
import { ConversationPartner, createPartner, uploadPartnerAvatar, updatePartner } from '@/lib/account-api';
import { useQueryClient } from '@tanstack/react-query';
import { PartnerAvatar } from '@/components/partner-avatar';
import { PartnerVoiceSelector } from '@/components/partner-voice-selector';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { ROLEPLAY_VOICE_OPTIONS } from '@/lib/roleplay-voices';
import { Textarea } from '@/components/ui/textarea';

const conversationTopics = [
  { id: 'daily_chat', icon: '💬', title: t`Daily chat buddy` },
  { id: 'travel_guide', icon: '🗺️', title: t`Travel guide` },
  { id: 'kpop_interviewer', icon: '🎤', title: t`K-pop interviewer` },
  { id: 'cafe_staff', icon: '☕', title: t`Cafe barista` },
  { id: 'fitness_coach', icon: '💪', title: t`Fitness coach` },
  { id: 'business_colleague', icon: '💼', title: t`Business teammate` },
];

const relationshipOptions = [
  { id: 'friend', icon: '👥', title: t`Close friend`, description: t`Playful, nosy, always on your side.` },
  { id: 'mentor', icon: '🎓', title: t`Mentor`, description: t`Gentle hype with real advice.` },
  { id: 'coworker', icon: '💼', title: t`Collaborative coworker`, description: t`Sharp, helpful, and still human.` },
  { id: 'romantic', icon: '❤️', title: t`Romantic crush`, description: t`Soft compliments + little sparks.` },
  { id: 'family', icon: '👨‍👩‍👧', title: t`Family vibe`, description: t`Cozy, honest, big sibling energy.` },
];

const genderOptions = [
  { id: 'male', label: t`Male` },
  { id: 'female', label: t`Female` },
  { id: 'unspecified', label: t`No preference` },
];

const ageOptions = [
  { id: 'early20s', label: t`Early 20s` },
  { id: 'late20s', label: t`Late 20s` },
  { id: 'thirties', label: t`30s` },
  { id: 'forties', label: t`40+` },
];

const nameSuggestions = ['Alex', 'Mia', 'Yuki', 'Sofia', 'Noah', 'Elena', 'Theo', 'Luna'];

const DEFAULT_ROLEPLAY_VOICE_ID = ROLEPLAY_VOICE_OPTIONS[0]?.id ?? '';

type CreateStep = 'topics' | 'relationship' | 'basics' | 'naming' | 'birth';

interface CustomPartnerCreatorProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  learningLang?: string;
  nativeLang?: string | null;
  limitBlocked: boolean;
  onQuotaBlocked: () => void;
  onPartnerCreated: (partner: ConversationPartner) => void;
}

export function CustomPartnerCreator({
  open,
  onClose,
  token,
  learningLang,
  nativeLang,
  limitBlocked,
  onQuotaBlocked,
  onPartnerCreated,
}: CustomPartnerCreatorProps) {
  const [flowStep, setFlowStep] = useState<CreateStep>('topics');
  const [nameDraft, setNameDraft] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(['daily_chat']);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [customTopicInputVisible, setCustomTopicInputVisible] = useState(false);
  const [relationshipStyle, setRelationshipStyle] = useState('friend');
  const [gender, setGender] = useState('unspecified');
  const [ageRange, setAgeRange] = useState('late20s');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customTopicInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const resetState = useCallback(() => {
    setFlowStep('topics');
    setNameDraft('');
    setSelectedTopicIds(['daily_chat']);
    setCustomTopics([]);
    setCustomTopicInput('');
    setCustomTopicInputVisible(false);
    setRelationshipStyle('friend');
    setGender('unspecified');
    setAgeRange('late20s');
    setAvatarFile(null);
    setAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  useEffect(() => {
    if (customTopicInputVisible) {
      customTopicInputRef.current?.focus();
    }
  }, [customTopicInputVisible]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((previous) =>
      previous.includes(topicId) ? previous.filter((id) => id !== topicId) : [...previous, topicId]
    );
  };

  const handleAddCustomTopic = () => {
    const trimmed = customTopicInput.trim();
    if (!trimmed) {
      return;
    }
    setCustomTopics((previous) => (previous.includes(trimmed) ? previous : [...previous, trimmed]));
    setCustomTopicInput('');
    setCustomTopicInputVisible(false);
  };

  const handleCustomTopicKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddCustomTopic();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setCustomTopicInputVisible(false);
      setCustomTopicInput('');
    }
  };

  const mergedTopics = [
    ...conversationTopics.filter((topic) => selectedTopicIds.includes(topic.id)).map((topic) => topic.title),
    ...customTopics,
  ].filter(Boolean);

  const primaryButtonDisabled =
    (flowStep === 'topics' && mergedTopics.length === 0) || (flowStep === 'naming' && !nameDraft.trim());

  const handleNext = async () => {
    if (flowStep === 'naming') {
      if (!token) {
        toast.error(t`Unable to save partner`, {
          description: t`Authentication token not available. Please refresh the page.`,
        });
        return;
      }
      if (!learningLang) {
        toast.error(t`Missing learning language for your profile`);
        return;
      }
      if (limitBlocked) {
        onQuotaBlocked();
        return;
      }
      const scenarioLabel = mergedTopics.length > 0 ? `Topics: ${mergedTopics.join(', ')}` : null;
      const relationshipLabel = relationshipOptions.find((option) => option.id === relationshipStyle)?.title || null;
      const identityLabel = [
        genderOptions.find((option) => option.id === gender)?.label,
        ageOptions.find((option) => option.id === ageRange)?.label,
      ]
        .filter(Boolean)
        .join(', ');
      const descriptionSegments = [
        scenarioLabel,
        relationshipLabel && `Relationship: ${relationshipLabel}`,
        identityLabel,
      ]
        .filter(Boolean)
        .join(' • ');

      setIsSaving(true);
      setFlowStep('birth');
      try {
        let partner = await createPartner(token, {
          name: nameDraft.trim(),
          description: descriptionSegments || undefined,
          learningLang,
          nativeLang: nativeLang || undefined,
          voiceId: DEFAULT_ROLEPLAY_VOICE_ID || undefined,
        });
        if (avatarFile) {
          partner = await uploadPartnerAvatar(token, partner.id, avatarFile);
        }
        queryClient.setQueryData<ConversationPartner[] | undefined>(['partners', token, learningLang], (previous) => {
          const existing = previous || [];
          if (existing.some((existingPartner) => existingPartner.id === partner.id)) {
            return existing;
          }
          return [partner, ...existing];
        });
        toast.success(t`Custom partner ready`);
        onPartnerCreated(partner);
        onClose();
      } catch (error) {
        console.error('[CustomPartnerCreator] Failed to save partner', error);
        toast.error(t`Unable to save partner`);
        setFlowStep('naming');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const flowOrder: CreateStep[] = ['topics', 'relationship', 'basics', 'naming'];
    const currentIndex = flowOrder.indexOf(flowStep);
    const nextStep = flowOrder[currentIndex + 1];
    if (nextStep) {
      setFlowStep(nextStep);
    }
  };

  const handleBack = () => {
    if (flowStep === 'topics') {
      onClose();
      return;
    }
    const flowOrder: CreateStep[] = ['topics', 'relationship', 'basics', 'naming'];
    const currentIndex = flowOrder.indexOf(flowStep);
    if (currentIndex <= 0) {
      return;
    }
    setFlowStep(flowOrder[currentIndex - 1]);
  };

  const renderContent = () => {
    if (flowStep === 'topics') {
      return (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">
              <Trans>Conversation topics</Trans>
            </h3>
            <p className="text-sm text-muted-foreground">
              <Trans>Tap whatever sounds fun.</Trans>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {conversationTopics.map((topic) => {
              const isSelected = selectedTopicIds.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => toggleTopic(topic.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-muted/40 hover:bg-muted/60'
                  )}
                >
                  <span className="text-base leading-none">{topic.icon}</span>
                  <span>{topic.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomTopicInputVisible(true)}
              className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer bg-muted/30"
            >
              <span className="text-base leading-none">+</span>
              <span>
                <Trans>Add topic</Trans>
              </span>
            </button>
          </div>
          {customTopicInputVisible && (
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
              <Input
                ref={customTopicInputRef}
                value={customTopicInput}
                onChange={(event) => setCustomTopicInput(event.target.value)}
                onKeyDown={handleCustomTopicKeyDown}
                placeholder={t`Try “Kyoto bookshop”, “LA film set”…`}
                disabled={isSaving}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddCustomTopic}
                  disabled={isSaving || !customTopicInput.trim()}
                  className="cursor-pointer disabled:cursor-not-allowed"
                >
                  <Trans>Save</Trans>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCustomTopicInputVisible(false);
                    setCustomTopicInput('');
                  }}
                  className="cursor-pointer"
                >
                  <Trans>Cancel</Trans>
                </Button>
              </div>
            </div>
          )}
          {customTopics.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-3">
              {customTopics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setCustomTopics((previous) => previous.filter((item) => item !== topic))}
                  className="group flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground transition hover:border-destructive hover:text-destructive"
                >
                  {topic}
                  <span className="text-xs opacity-70 group-hover:opacity-100">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (flowStep === 'relationship') {
      return (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">
              <Trans>Relationship vibe</Trans>
            </h3>
            <p className="text-sm text-muted-foreground">
              <Trans>Tap a mood. Instant chemistry.</Trans>
            </p>
          </div>
          <div className="space-y-2">
            {relationshipOptions.map((option) => {
              const isSelected = relationshipStyle === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRelationshipStyle(option.id)}
                  className={cn(
                    'w-full rounded-2xl border px-4 py-3 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    isSelected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{option.icon}</span>
                    <div>
                      <p className="text-sm font-semibold">{option.title}</p>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (flowStep === 'basics') {
      return (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">
              <Trans>Basics</Trans>
            </h3>
            <p className="text-sm text-muted-foreground">
              <Trans>Quick sliders for their overall feel.</Trans>
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                <Trans>Gender</Trans>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {genderOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setGender(option.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                      gender === option.id ? 'border-primary bg-primary/10 font-semibold' : 'border-border'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                <Trans>Age range</Trans>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ageOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAgeRange(option.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                      ageRange === option.id ? 'border-primary bg-primary/10 font-semibold' : 'border-border'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (flowStep === 'naming') {
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">
              <Trans>Name & photo</Trans>
            </h3>
            <p className="text-sm text-muted-foreground">
              <Trans>Grab a name or type your own.</Trans>
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
                className="group relative inline-flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                aria-label={t`Change partner photo`}
              >
                <PartnerAvatar
                  className="pointer-events-none h-24 w-24"
                  fallbackSize="lg"
                  name={nameDraft || undefined}
                  src={avatarPreview || undefined}
                />
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold tracking-wide text-white opacity-0 transition group-hover:opacity-100',
                    isSaving && 'opacity-100'
                  )}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trans>Edit</Trans>}
                </span>
              </button>
              <span className="text-[11px] font-semibold text-muted-foreground">
                <Trans>Photo</Trans>
              </span>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={clearAvatar}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  <Trans>Remove</Trans>
                </button>
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  <Trans>Name</Trans>
                </Label>
                <Input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder={t`Give them a memorable name`}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  <Trans>Suggested names</Trans>
                </p>
                <div className="flex flex-wrap gap-2">
                  {nameSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setNameDraft(name)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                        nameDraft === name ? 'border-primary bg-primary/10 font-semibold' : 'border-border'
                      )}
                      disabled={isSaving}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
      );
    }

    return (
      <div className="space-y-5 py-4 text-center">
        <p className="text-xs font-semibold text-muted-foreground">
          <Trans>Almost there</Trans>
        </p>
        <h3 className="text-2xl font-semibold">
          <Trans>They're getting ready...</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>Give us a few seconds to style them.</Trans>
        </p>
        <div className="flex flex-col items-center gap-4 pt-3">
          <Loader2 className="h-9 w-9 animate-spin text-primary" strokeWidth={2.25} />
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
          <div className="w-full space-y-2 text-left">
            {[t`Crafting their persona...`, t`Warming up their voice...`].map((label) => (
              <div key={label} className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader className="space-y-1">
          <DialogTitle>
            <Trans>Create your custom partner</Trans>
          </DialogTitle>
          <DialogDescription className="text-sm">
            <Trans>Let’s sketch someone you’d love to chat with.</Trans>
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        {flowStep !== 'birth' && (
          <DialogFooter className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button
                variant="ghost"
                type="button"
                onClick={handleBack}
                disabled={isSaving}
                className="cursor-pointer disabled:cursor-not-allowed"
              >
                {flowStep === 'topics' ? <Trans>Cancel</Trans> : <Trans>Back</Trans>}
              </Button>
              <Button
                type="button"
                onClick={handleNext}
                disabled={primaryButtonDisabled || isSaving}
                className="cursor-pointer disabled:cursor-not-allowed"
              >
                {flowStep === 'naming' ? <Trans>Create partner</Trans> : <Trans>Next</Trans>}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CustomPartnerEditorProps {
  open: boolean;
  onClose: () => void;
  partner: ConversationPartner | null;
  token: string | null;
  learningLang?: string;
  onPartnerUpdated: (partner: ConversationPartner) => void;
  onVoicePreview: (voiceId: string, sampleText: string) => Promise<void>;
  loadingVoiceId: string | null;
  playingVoiceId: string | null;
}

export function CustomPartnerEditor({
  open,
  onClose,
  partner,
  token,
  learningLang,
  onPartnerUpdated,
  onVoicePreview,
  loadingVoiceId,
  playingVoiceId,
}: CustomPartnerEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_ROLEPLAY_VOICE_ID);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && partner) {
      setName(partner.name || '');
      setDescription(partner.description || '');
      setVoiceId(partner.voiceId || DEFAULT_ROLEPLAY_VOICE_ID);
      setAvatarPreview(partner.avatarUrl || null);
      setAvatarFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } else if (!open) {
      setAvatarFile(null);
      setAvatarPreview((previous) => {
        if (previous && previous.startsWith('blob:')) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
    }
  }, [open, partner]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
  };

  const handleSave = async () => {
    if (!partner || !token) {
      toast.error(t`Unable to save partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    if (!name.trim()) {
      toast.error(t`Enter a name for your partner`);
      return;
    }
    setIsSaving(true);
    try {
      let updatedPartner = await updatePartner(token, partner.id, {
        name: name.trim(),
        description: description.trim() || null,
        voiceId: voiceId || null,
      });
      if (avatarFile) {
        updatedPartner = await uploadPartnerAvatar(token, partner.id, avatarFile);
      }
      queryClient.setQueryData<ConversationPartner[] | undefined>(['partners', token, learningLang], (previous) =>
        (previous || []).map((existing) => (existing.id === updatedPartner.id ? updatedPartner : existing))
      );
      toast.success(t`Partner updated`);
      onPartnerUpdated(updatedPartner);
      onClose();
    } catch (error) {
      console.error('[CustomPartnerEditor] Failed to save partner', error);
      toast.error(t`Unable to save partner`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit partner</Trans>
          </DialogTitle>
          <DialogDescription className="text-sm">
            <Trans>Update your custom partner details.</Trans>
          </DialogDescription>
        </DialogHeader>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className="group relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              aria-label={t`Change partner photo`}
            >
              <PartnerAvatar
                className="pointer-events-none h-20 w-20"
                fallbackSize="lg"
                name={partner?.name || undefined}
                src={avatarPreview || undefined}
              />
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100',
                  isSaving && 'opacity-100'
                )}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trans>Edit</Trans>}
              </span>
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>Photo</Trans>
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Name</Trans>
              </Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t`Enter a name`}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Description</Trans>
              </Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t`Add a short description`}
                disabled={isSaving}
                rows={3}
              />
            </div>
            <PartnerVoiceSelector
              selectedVoiceId={voiceId || DEFAULT_ROLEPLAY_VOICE_ID}
              onSelect={setVoiceId}
              onPreview={onVoicePreview}
              loadingVoiceId={loadingVoiceId}
              playingVoiceId={playingVoiceId}
              disabled={isSaving}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            <Trans>Close</Trans>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            <Trans>Save</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
