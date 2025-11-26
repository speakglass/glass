'use client';

import Chat from '@/components/chat';
import { AuthGate } from '@/components/auth-gate';

export default function Page() {
  return (
    <AuthGate>
      <div className={'grow flex flex-col h-dvh overflow-hidden'}>
        <Chat />
      </div>
    </AuthGate>
  );
}
