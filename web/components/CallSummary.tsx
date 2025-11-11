'use client';
import { cn } from '@/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo } from 'react';
import { X, Edit2, Check, Trash2, Save, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WaitlistModal from '@/components/WaitlistModal';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

interface ConversationScores {
  fluency: number;
  accuracy: number;
  comprehensibility: number;
}

interface ExtractedInfo {
  label: string;
  value: string;
  editable: boolean;
}

interface Message {
  speaker: string;
  source: string;
  text: string;
  utterance_id?: string;
  translation?: string;
}

interface FeedbackItem {
  utterance_id: string;
  text: string;
}

interface CallSummaryProps {
  sessionId: string;
  scores: ConversationScores;
  extractedInfo?: ExtractedInfo[];
  feedback?: string;
  messages?: Message[];
  feedbackItems?: FeedbackItem[];
  onClose: () => void;
  onStartNewCall: (contextInfo: ExtractedInfo[]) => void;
}

const CallSummary = ({
  sessionId,
  scores,
  extractedInfo: initialInfo = [],
  feedback = '',
  messages = [],
  feedbackItems = [],
  onClose,
  onStartNewCall,
}: CallSummaryProps) => {
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo[]>(initialInfo || []);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showConversation, setShowConversation] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  // Create a map of utterance_id to feedback
  const feedbackMap = useMemo(() => {
    const map = new Map<string, string[]>();
    feedbackItems.forEach((fb) => {
      if (fb.utterance_id) {
        if (!map.has(fb.utterance_id)) {
          map.set(fb.utterance_id, []);
        }
        map.get(fb.utterance_id)!.push(fb.text);
      }
    });
    return map;
  }, [feedbackItems]);

  const handleEdit = (index: number) => {
    setEditingId(index);
    setEditValue(extractedInfo[index].value);
  };

  const handleSave = (index: number) => {
    const updated = [...extractedInfo];
    updated[index].value = editValue;
    setExtractedInfo(updated);
    setEditingId(null);
  };

  const handleDelete = (index: number) => {
    setExtractedInfo(extractedInfo.filter((_, i) => i !== index));
  };

  const handleWaitlistSuccess = () => {
    setShowWaitlistModal(false);
    setWaitlistSuccess(true);
    // Save memory and close after a delay
    setTimeout(() => {
      onStartNewCall(extractedInfo);
    }, 2000);
  };

  const averageScore = Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3);

  const getScoreLabel = (score: number): { text: string; color: string } => {
    if (score >= 80) return { text: t`Excellent`, color: 'text-emerald-500' };
    if (score >= 60) return { text: t`Good`, color: 'text-teal-500' };
    if (score >= 40) return { text: t`Average`, color: 'text-amber-500' };
    if (score >= 20) return { text: t`Below Average`, color: 'text-orange-500' };
    return { text: t`Low`, color: 'text-red-500' };
  };

  // Calculate indicator position based on flex ratios
  const getIndicatorPosition = (score: number): number => {
    const flexRatios = [0.5, 1, 2, 1, 0.5]; // flex values for each segment
    const totalFlex = flexRatios.reduce((sum, flex) => sum + flex, 0); // 5

    // Determine which segment the score falls into
    let segmentIndex = 0;
    let segmentStart = 0;

    if (score <= 20) {
      segmentIndex = 0;
      segmentStart = 0;
    } else if (score <= 40) {
      segmentIndex = 1;
      segmentStart = 20;
    } else if (score <= 60) {
      segmentIndex = 2;
      segmentStart = 40;
    } else if (score <= 80) {
      segmentIndex = 3;
      segmentStart = 60;
    } else {
      segmentIndex = 4;
      segmentStart = 80;
    }

    // Calculate the start position of this segment
    const flexBeforeSegment = flexRatios.slice(0, segmentIndex).reduce((sum, flex) => sum + flex, 0);
    const segmentStartPercent = (flexBeforeSegment / totalFlex) * 100;

    // Calculate position within the segment
    const segmentSize = 20; // each segment represents 20 points
    const positionInSegment = (score - segmentStart) / segmentSize;
    const segmentWidthPercent = (flexRatios[segmentIndex] / totalFlex) * 100;

    return segmentStartPercent + segmentWidthPercent * positionInSegment;
  };

  // Entity type colors
  const entityColors: Record<string, string> = {
    User: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    Preference: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
    Location: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    Event: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
    Object: 'bg-pink-500/10 text-pink-500 border-pink-500/30',
    Topic: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
    Organization: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    Document: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={'fixed inset-0 z-50 flex items-center justify-center p-4'}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={
          'relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-card border border-border/50 rounded-2xl shadow-2xl'
        }
      >
        {/* Header */}
        <div className={'sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/30 px-6 py-4'}>
          <div className={'flex items-center justify-between'}>
            <h2 className={'text-xl font-bold'}>
              <Trans>Call Summary</Trans>
            </h2>
            <button
              onClick={onClose}
              className={
                'text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent/50'
              }
              aria-label="Close"
            >
              <X className={'size-5'} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={'p-6 space-y-6'}>
          {/* Score Overview */}
          <section>
            <div className={'flex items-center justify-between mb-6'}>
              <div>
                <span className={'text-sm font-medium text-muted-foreground block mb-1'}>
                  <Trans>Overall Score</Trans>
                </span>
                <span className={'text-4xl font-bold'}>{averageScore}</span>
              </div>

              {/* Bar Graph Gauge */}
              <div className={'flex items-end gap-1 h-12'}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                  const scorePercent = averageScore / 100;
                  const segmentThreshold = i / 8;
                  const isActive = scorePercent > segmentThreshold;

                  // Height increases to the right
                  const heights = [25, 35, 45, 55, 65, 75, 85, 95];
                  const height = heights[i];

                  // Color based on position
                  let color = 'rgb(239, 68, 68)'; // red
                  if (i >= 6) color = 'rgb(16, 185, 129)'; // emerald
                  else if (i >= 5) color = 'rgb(20, 184, 166)'; // teal
                  else if (i >= 3) color = 'rgb(245, 158, 11)'; // amber
                  else if (i >= 2) color = 'rgb(251, 146, 60)'; // orange

                  return (
                    <motion.div
                      key={i}
                      className={'w-2 rounded-full'}
                      style={{
                        height: `${height}%`,
                        backgroundColor: isActive ? color : 'rgba(100, 116, 139, 0.2)',
                      }}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: `${height}%`, opacity: 1 }}
                      transition={{
                        duration: 0.4,
                        delay: i * 0.04,
                        ease: 'easeOut',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Segmented gauges */}
            <div className={'space-y-2'}>
              {/* Fluency */}
              <div>
                <div className={'flex items-center justify-between mb-1.5'}>
                  <span className={'text-xs text-muted-foreground'}>
                    <Trans>Fluency</Trans>
                  </span>
                  <span className={cn('text-sm font-medium', getScoreLabel(scores.fluency).color)}>
                    {getScoreLabel(scores.fluency).text}
                  </span>
                </div>
                <div className={'relative'}>
                  <div className={'flex gap-1 h-2'}>
                    {/* 0-20: Low (red) - narrowest */}
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.fluency > 0 && scores.fluency <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                      )}
                      style={{ flex: 0.5 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    />
                    {/* 20-40: Below Average (orange) */}
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.fluency > 20 && scores.fluency <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                      )}
                      style={{ flex: 1 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.15 }}
                    />
                    {/* 40-60: Average (amber) - widest */}
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.fluency > 40 && scores.fluency <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                      )}
                      style={{ flex: 2 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                    />
                    {/* 60-80: Good (teal) */}
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.fluency > 60 && scores.fluency <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                      )}
                      style={{ flex: 1 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.25 }}
                    />
                    {/* 80-100: Excellent (emerald) - narrowest */}
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.fluency > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                      )}
                      style={{ flex: 0.5 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    />
                  </div>
                  {/* Current position indicator */}
                  <motion.div
                    className={'absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                    style={{
                      left: `${getIndicatorPosition(scores.fluency)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.5 }}
                  />
                </div>
              </div>

              {/* Accuracy */}
              <div>
                <div className={'flex items-center justify-between mb-1.5'}>
                  <span className={'text-xs text-muted-foreground'}>
                    <Trans>Accuracy</Trans>
                  </span>
                  <span className={cn('text-sm font-medium', getScoreLabel(scores.accuracy).color)}>
                    {getScoreLabel(scores.accuracy).text}
                  </span>
                </div>
                <div className={'relative'}>
                  <div className={'flex gap-1 h-2'}>
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.accuracy > 0 && scores.accuracy <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                      )}
                      style={{ flex: 0.5 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.35 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.accuracy > 20 && scores.accuracy <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                      )}
                      style={{ flex: 1 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.accuracy > 40 && scores.accuracy <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                      )}
                      style={{ flex: 2 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.45 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.accuracy > 60 && scores.accuracy <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                      )}
                      style={{ flex: 1 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.5 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.accuracy > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                      )}
                      style={{ flex: 0.5 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.55 }}
                    />
                  </div>
                  {/* Current position indicator */}
                  <motion.div
                    className={'absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                    style={{
                      left: `${getIndicatorPosition(scores.accuracy)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.6 }}
                  />
                </div>
              </div>

              {/* Comprehensibility */}
              <div>
                <div className={'flex items-center justify-between mb-1.5'}>
                  <span className={'text-xs text-muted-foreground'}>
                    <Trans>Comprehensibility</Trans>
                  </span>
                  <span className={cn('text-sm font-medium', getScoreLabel(scores.comprehensibility).color)}>
                    {getScoreLabel(scores.comprehensibility).text}
                  </span>
                </div>
                <div className={'relative'}>
                  <div className={'flex gap-1 h-2'}>
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.comprehensibility > 0 && scores.comprehensibility <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                      )}
                      style={{ flex: 0.5 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.6 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.comprehensibility > 20 && scores.comprehensibility <= 40
                          ? 'bg-orange-500'
                          : 'bg-orange-500/30'
                      )}
                      style={{ flex: 1 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.65 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.comprehensibility > 40 && scores.comprehensibility <= 60
                          ? 'bg-amber-500'
                          : 'bg-amber-500/30'
                      )}
                      style={{ flex: 2 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.7 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.comprehensibility > 60 && scores.comprehensibility <= 80
                          ? 'bg-teal-500'
                          : 'bg-teal-500/30'
                      )}
                      style={{ flex: 1 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.75 }}
                    />
                    <motion.div
                      className={cn(
                        'rounded-full transition-opacity duration-300',
                        scores.comprehensibility > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                      )}
                      style={{ flex: 0.5 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.8 }}
                    />
                  </div>
                  {/* Current position indicator */}
                  <motion.div
                    className={'absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                    style={{
                      left: `${getIndicatorPosition(scores.comprehensibility)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.85 }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Feedback with Glass AI Avatar */}
          {feedback && (
            <section>
              <div className={'flex items-start gap-3'}>
                {/* Glass AI Avatar */}
                <div className={'shrink-0'}>
                  <div className={'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'}>
                    <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
                  </div>
                </div>

                {/* Feedback Bubble */}
                <div className={'flex-1 bg-background/50 border border-border/30 rounded-xl p-4'}>
                  <p className={'text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed'}>{feedback}</p>
                </div>
              </div>
            </section>
          )}

          {/* Memory */}
          <section>
            <button
              onClick={() => setShowMemory(!showMemory)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <Save className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Memory</Trans>
                </span>
                <span className={'text-xs text-muted-foreground'}>({extractedInfo.length})</span>
              </div>
              {showMemory ? <ChevronUp className={'size-4'} /> : <ChevronDown className={'size-4'} />}
            </button>

            <AnimatePresence>
              {showMemory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={'overflow-hidden'}
                >
                  <div
                    className={
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-2'
                    }
                  >
                    {extractedInfo.length > 0 ? (
                      <AnimatePresence mode="popLayout">
                        {extractedInfo.map((info, index) => (
                          <motion.div
                            key={index}
                            layout
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className={
                              'flex items-start gap-2 p-2 rounded-lg bg-background/50 border border-border/20 hover:bg-accent/20 transition-colors'
                            }
                          >
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                                entityColors[info.label] || 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                              )}
                            >
                              {info.label}
                            </span>

                            <div className={'flex-1 min-w-0'}>
                              {editingId === index ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className={
                                    'w-full bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50'
                                  }
                                  autoFocus
                                />
                              ) : (
                                <div className={'text-sm break-words'}>{info.value}</div>
                              )}
                            </div>

                            {info.editable && (
                              <div className={'flex items-center gap-0.5 shrink-0'}>
                                {editingId === index ? (
                                  <button
                                    onClick={() => handleSave(index)}
                                    className={
                                      'text-emerald-500 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-accent/50'
                                    }
                                    aria-label="Save"
                                  >
                                    <Check className={'size-3'} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleEdit(index)}
                                    className={
                                      'text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent/50'
                                    }
                                    aria-label="Edit"
                                  >
                                    <Edit2 className={'size-3'} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(index)}
                                  className={
                                    'text-red-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-accent/50'
                                  }
                                  aria-label="Delete"
                                >
                                  <Trash2 className={'size-3'} />
                                </button>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    ) : (
                      <div className={'text-center py-6 text-xs text-muted-foreground'}>
                        <Trans>No information saved yet</Trans>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Collapsible: Conversation History with Feedback */}
          <section>
            <button
              onClick={() => setShowConversation(!showConversation)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <MessageSquare className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Conversation History</Trans>
                </span>
                <span className={'text-xs text-muted-foreground'}>({messages.length})</span>
              </div>
              {showConversation ? <ChevronUp className={'size-4'} /> : <ChevronDown className={'size-4'} />}
            </button>
            <AnimatePresence>
              {showConversation && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={'overflow-hidden'}
                >
                  <div
                    className={
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-3'
                    }
                  >
                    {messages.length > 0 ? (
                      messages.map((msg, index) => {
                        const messageFeedback = msg.utterance_id ? feedbackMap.get(msg.utterance_id) : null;
                        const isUser = msg.speaker === 'user' || msg.speaker === 'mic';
                        const displayName = isUser ? <Trans>You</Trans> : <Trans>Partner</Trans>;

                        return (
                          <div key={index} className={'space-y-1.5'}>
                            {/* Message */}
                            <div className={cn('pb-2', isUser && 'flex flex-col items-end')}>
                              <div className={'text-xs text-muted-foreground mb-0.5'}>{displayName}</div>
                              <div
                                className={cn(
                                  'text-sm',
                                  isUser ? 'bg-primary/10 rounded-lg px-3 py-2 max-w-[80%]' : ''
                                )}
                              >
                                {msg.text}
                                {msg.translation && (
                                  <div className={'text-xs text-muted-foreground mt-1 italic'}>{msg.translation}</div>
                                )}
                              </div>
                            </div>

                            {/* Feedback for this message */}
                            {messageFeedback && messageFeedback.length > 0 && (
                              <div className={cn('ml-4 space-y-1', isUser && 'ml-0 flex flex-col items-end')}>
                                {messageFeedback.map((fb, fbIndex) => (
                                  <div key={fbIndex} className={'text-xs text-sky-600 leading-relaxed'}>
                                    {fb}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className={'text-center py-4 text-sm text-muted-foreground'}>
                        <Trans>No messages</Trans>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Footer Actions */}
        <div className={'sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border/30 px-6 py-4'}>
          {waitlistSuccess ? (
            <div className={'text-center py-2'}>
              <p className={'text-sm text-emerald-500 font-medium'}>
                <Trans>✓ Successfully saved! Redirecting...</Trans>
              </p>
            </div>
          ) : (
            <div className={'flex items-center justify-between gap-3'}>
              <Button variant="outline" onClick={onClose} size="sm" className={'flex-1'}>
                <Trans>Close</Trans>
              </Button>
              <Button
                onClick={() => setShowWaitlistModal(true)}
                size="sm"
                className={'flex-1 bg-primary hover:bg-primary/90'}
              >
                <Save className={'size-4 mr-2'} />
                <Trans>Save Call</Trans>
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Waitlist Modal */}
      <WaitlistModal
        isOpen={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        onSuccess={handleWaitlistSuccess}
        sessionId={sessionId}
        scores={scores}
        extractedInfo={extractedInfo}
      />
    </motion.div>
  );
};

export default CallSummary;
