import { motion } from 'motion/react';
import { Trans } from '@lingui/react/macro';
import { Phone } from 'lucide-react';
import { Button } from './ui/button';

interface StartCallEntryProps {
  onStart: () => void;
}

export function StartCallEntry({ onStart }: StartCallEntryProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        variants={{
          initial: { scale: 0.5 },
          enter: { scale: 1 },
          exit: { scale: 0.5 },
        }}
      >
        <Button
          className="z-50 flex items-center gap-1.5 rounded-full cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          onClick={onStart}
        >
          <span>
            <Phone className="size-4 opacity-50 fill-current" strokeWidth={0} />
          </span>
          <span>
            <Trans>Start Call</Trans>
          </span>
        </Button>
      </motion.div>
    </div>
  );
}
