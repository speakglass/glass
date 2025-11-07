'use client';

import * as React from 'react';
import { cn } from '@/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-border/40', className)}
      {...props}
    >
      <div className={'h-full bg-primary transition-[width] duration-300 ease-out'} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default Progress;
