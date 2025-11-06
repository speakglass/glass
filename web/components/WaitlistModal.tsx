'use client';
import { cn } from '@/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Sparkles, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExtractedInfo {
  label: string;
  value: string;
  editable: boolean;
}

interface ConversationScores {
  fluency: number;
  accuracy: number;
  comprehensibility: number;
}

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sessionId: string;
  scores: ConversationScores;
  extractedInfo: ExtractedInfo[];
}

const WaitlistModal = ({ isOpen, onClose, onSuccess, sessionId, scores, extractedInfo }: WaitlistModalProps) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('https://api.speakglass.com/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          sessionId: sessionId,
          scores: scores,
          extractedInfo: extractedInfo,
        }),
      });

      if (response.ok) {
        try {
          onSuccess();
        } catch {}
        router.push('/waitlist/success');
      } else {
        setError('We had trouble adding you. Please try again later.');
      }
    } catch (error) {
      console.error('Error joining waitlist:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={'fixed inset-0 z-[60] flex items-center justify-center p-4'}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={
              'relative w-full max-w-lg bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden'
            }
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient Background */}
            <div
              className={'absolute inset-0 opacity-30'}
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
              }}
            />

            {/* Close Button */}
            <button
              onClick={onClose}
              className={
                'absolute top-4 right-4 z-10 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent/50'
              }
              aria-label="Close"
            >
              <X className={'size-5'} />
            </button>

            {/* Content */}
            <div className={'relative px-8 pt-12 pb-8'}>
              {/* Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                className={'flex justify-center mb-6'}
              >
                <div className={'size-20 rounded-full overflow-hidden bg-card/80 border border-border/50 shadow-lg'}>
                  <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
                </div>
              </motion.div>

              {/* Heading */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={'text-center mb-4'}
              >
                <h3 className={'text-2xl font-bold mb-2'}>Glass AI helps you speak any language in the real world</h3>
                <p className={'text-muted-foreground text-sm leading-relaxed'}>
                  Practice speaking. Get help in real meetings. Remembers everything.
                </p>
              </motion.div>

              {/* Features */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className={'space-y-3 mb-6'}
              >
                <div className={'flex items-start gap-3'}>
                  <div className={'shrink-0 mt-0.5'}>
                    <div
                      className={
                        'size-6 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20'
                      }
                    >
                      <Sparkles className={'size-3.5 text-emerald-500'} />
                    </div>
                  </div>
                  <div>
                    <p className={'text-sm font-medium'}>Gets smarter every time you speak</p>
                    <p className={'text-xs text-muted-foreground'}>Remembers who you are, what you care about</p>
                  </div>
                </div>

                <div className={'flex items-start gap-3'}>
                  <div className={'shrink-0 mt-0.5'}>
                    <div
                      className={
                        'size-6 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20'
                      }
                    >
                      <Zap className={'size-3.5 text-blue-500'} />
                    </div>
                  </div>
                  <div>
                    <p className={'text-sm font-medium'}>Works in real meetings</p>
                    <p className={'text-xs text-muted-foreground'}>Practice mode or live on Zoom calls</p>
                  </div>
                </div>
              </motion.div>

              {/* Form */}
              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onSubmit={handleSubmit}
                className={'space-y-4'}
              >
                <div>
                  <label htmlFor="waitlist-email" className={'text-sm font-medium block mb-2'}>
                    Enter your email
                  </label>
                  <input
                    id="waitlist-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="you@example.com"
                    className={cn(
                      'w-full bg-background/50 border border-border rounded-lg px-4 py-3 text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent',
                      'transition-all placeholder:text-muted-foreground/50',
                      error && 'border-red-500 focus:ring-red-500/50'
                    )}
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={'text-xs text-red-500 mt-1.5'}
                    >
                      {error}
                    </motion.p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className={
                    'w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-3.5 text-sm shadow-lg hover:shadow-xl transition-all'
                  }
                >
                  {isSubmitting ? (
                    <span className={'flex items-center justify-center gap-2'}>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className={'size-4 border-2 border-white/30 border-t-white rounded-full'}
                      />
                      Joining...
                    </span>
                  ) : (
                    <span className={'flex items-center justify-center gap-2'}>
                      Join Early Access
                      <ArrowRight className={'size-4'} />
                    </span>
                  )}
                </Button>

                <p className={'text-xs text-center text-muted-foreground'}>
                  We&apos;ll notify you when early access is ready. No spam, ever.
                </p>
              </motion.form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WaitlistModal;
