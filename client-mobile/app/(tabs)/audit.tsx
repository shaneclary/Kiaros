// Phase D — Audit screen
import { View, Text, SafeAreaView } from 'react-native'
export default function AuditScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>📋 Audit</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
        <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Coming in Phase D</Text>
        <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
          Paginated tool call audit log with undo and cost tracking.
        </Text>
      </View>
    </SafeAreaView>
  )
}
