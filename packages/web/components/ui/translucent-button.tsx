import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}

const translucentButtonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-full text-white transition-all focus-visible:outline-none focus-visible:ring-white/40 focus-visible:ring-[3px] active:scale-95 backdrop-blur-sm border bg-white/10 border-white/20 hover:bg-white/15 hover:border-white/30',
  {
    variants: {
      size: {
        default: 'px-6 py-3.5 text-base font-medium',
        sm: 'px-4 py-2 text-sm font-medium',
        lg: 'px-8 py-4 text-lg font-medium',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

export interface TranslucentButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof translucentButtonVariants> {
  contentClassName?: string;
}

const TranslucentButton = React.forwardRef<HTMLButtonElement, TranslucentButtonProps>(
  ({ className, children, size, contentClassName, ...props }, ref) => {
    return (
      <button className={cn(translucentButtonVariants({ size }), className)} ref={ref} {...props}>
        <span className={cn('flex items-center gap-2', contentClassName)}>{children}</span>
      </button>
    );
  }
);
TranslucentButton.displayName = 'TranslucentButton';

export { TranslucentButton, translucentButtonVariants };
