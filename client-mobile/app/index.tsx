import { Redirect } from 'expo-router'

// Root is handled by _layout.tsx auth guard.
// This component satisfies Expo Router's requirement for an index screen.
export default function Index() {
  return <Redirect href="/(tabs)/chat" />
}
