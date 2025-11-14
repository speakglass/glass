'use client';

import { useState } from 'react';
import { MessageSquare, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const REACTIONS = [
  { icon: ThumbsUp, value: 'good', label: 'Good' },
  { icon: ThumbsDown, value: 'bad', label: 'Bad' },
];

export default function Feedback() {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [reaction, setReaction] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!feedback.trim()) {
      toast.error(t`Please enter your feedback`);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback: feedback.trim(),
          reaction,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }
      
      toast.success(t`Thank you for your feedback!`);
      setOpen(false);
      setFeedback('');
      setReaction(null);
    } catch (error) {
      console.error('Feedback submission error:', error);
      toast.error(t`Failed to submit feedback. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 px-3 cursor-pointer"
        >
          <MessageSquare className="size-3.5" />
          <span>
            <Trans>Feedback</Trans>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">
              <Trans>Send Feedback</Trans>
            </h4>
            <p className="text-xs text-muted-foreground">
              <Trans>Help us improve Glass</Trans>
            </p>
          </div>

          <Textarea
            placeholder={t`Your feedback...`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[80px] resize-none text-sm"
            disabled={isSubmitting}
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {REACTIONS.map((item) => {
                const Icon = item.icon;
                const isSelected = reaction === item.value;
                const isGood = item.value === 'good';
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setReaction(item.value)}
                    className={`p-1.5 rounded-md transition-colors hover:bg-accent/50 ${
                      isSelected
                        ? isGood
                          ? 'text-green-600'
                          : 'text-red-600'
                        : 'text-muted-foreground'
                    }`}
                    title={item.label}
                    disabled={isSubmitting}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !feedback.trim()}
            >
              {isSubmitting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trans>Send</Trans>
              )}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
