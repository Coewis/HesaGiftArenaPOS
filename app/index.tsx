import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
