import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useEffect } from 'react';
import { router } from 'expo-router';

export default function AppLayout() {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/(auth)/login');
    }
  }, [status]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="conversation/[id]" />
      <Stack.Screen name="partner/[id]" />
      <Stack.Screen name="partner-conversation" />
      <Stack.Screen name="new-partner" />
    </Stack>
  );
}
