import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/auth-context';

export default function Index() {
  const { status, onboardingStatus } = useAuth();

  useEffect(() => {
    // Wait until we have a definitive status
    if (status === 'loading' || status === 'idle') return;

    if (status === 'authenticated') {
      // Wait for onboarding status to be loaded
      // onboardingStatus will be null initially while loading
      // We need to wait for it to be defined before routing
      if (onboardingStatus !== null) {
        if (!onboardingStatus.completed) {
          router.replace('/(app)/onboarding');
        } else {
          router.replace('/(app)/(tabs)');
        }
      }
      // If onboardingStatus is still null, keep showing loading screen
      // It will be updated by the AuthContext initialization
    } else {
      // Unauthenticated - go to login
      router.replace('/(auth)/login');
    }
  }, [status, onboardingStatus]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
