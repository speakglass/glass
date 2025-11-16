"use client";

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/utils';

const FRAME_CLASS = 'border border-border/60 bg-card/80 text-foreground/80 shadow-xs';
const FALLBACK_BASE_CLASS = 'text-foreground/80 font-semibold uppercase leading-none';
const FALLBACK_SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-3xl',
};

interface PartnerAvatarProps {
  name?: string | null;
  src?: string | null;
  alt?: string | null;
  className?: string;
  fallbackSize?: 'sm' | 'md' | 'lg';
  fallbackClassName?: string;
}

export function PartnerAvatar({
  name,
  src,
  alt,
  className,
  fallbackSize = 'md',
  fallbackClassName,
}: PartnerAvatarProps) {
  const safeName = name || 'Partner';
  const initials = safeName.slice(0, 1).toUpperCase();
  const [showImage, setShowImage] = useState<boolean>(Boolean(src));

  useEffect(() => {
    setShowImage(Boolean(src));
  }, [src]);

  return (
    <Avatar className={cn(FRAME_CLASS, className)}>
      <AvatarImage
        className={cn('h-full w-full object-cover', !showImage && 'hidden')}
        src={src || undefined}
        alt={alt || safeName}
        onError={() => setShowImage(false)}
      />
      <AvatarFallback
        className={cn(FALLBACK_BASE_CLASS, FALLBACK_SIZE_CLASS[fallbackSize], fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
