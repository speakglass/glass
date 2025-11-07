'use client';

import * as React from 'react';

type TooltipProps = {
  children: React.ReactNode;
  className?: string;
};

type TooltipTriggerProps = {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
};

type TooltipContentProps = {
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
};

export function Tooltip({ children, className }: TooltipProps) {
  return <div className={`relative inline-flex items-center group/tt ${className ?? ''}`.trim()}>{children}</div>;
}

export function TooltipTrigger({ children, asChild = false, className }: TooltipTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, {
      className: `${(children as any).props?.className ?? ''} ${className ?? ''}`.trim(),
    });
  }
  return <span className={className}>{children}</span>;
}

export function TooltipContent({ children, className, side = 'top' }: TooltipContentProps) {
  // Only top side implemented for now (matches current usage).
  const pos =
    side === 'top'
      ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
      : side === 'bottom'
      ? 'top-full mt-2 left-1/2 -translate-x-1/2'
      : side === 'left'
      ? 'right-full mr-2 top-1/2 -translate-y-1/2'
      : 'left-full ml-2 top-1/2 -translate-y-1/2';

  const arrowPos =
    side === 'top'
      ? 'top-full left-1/2 -translate-x-1/2'
      : side === 'bottom'
      ? 'bottom-full left-1/2 -translate-x-1/2'
      : side === 'left'
      ? 'left-full top-1/2 -translate-y-1/2'
      : 'right-full top-1/2 -translate-y-1/2';

  return (
    <div
      className={[
        'pointer-events-none select-none z-50',
        'invisible opacity-0 group-hover/tt:visible group-hover/tt:opacity-100 transition-opacity duration-150',
        'absolute',
        pos,
        'whitespace-pre text-xs rounded-md px-2 py-1',
        'bg-black text-white shadow-md',
        className ?? '',
      ].join(' ')}
      role="tooltip"
    >
      {/* Arrow */}
      <span
        aria-hidden
        className={[
          'absolute w-2 h-2 rotate-45 bg-black',
          arrowPos,
          side === 'top' ? 'shadow-[1px_1px_0_rgba(0,0,0,0.2)]' : '',
        ].join(' ')}
      />
      <span className="relative z-10">{children}</span>
    </div>
  );
}
