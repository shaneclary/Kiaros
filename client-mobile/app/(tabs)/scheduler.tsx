import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal, Switch,
  Alert, ActivityIndicator, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native'
import { api } from '../../lib/api'
import { relativeTime, relativeTimeFuture } from '../../lib/time'
import { useAuth } from '../_layout'

interface Job {
  id: string
  name: string
  prompt: string
  schedule: string
  credentialId: string | null
  model: string | null
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastResultSummary: string | null
  lastError: string | null
  hasWebhook: boolean
  createdAt: string
}

interface Credential { id: string; label: string; model: string }

const SHORTHANDS = ['@hourly', '@daily', '@weekly', '@monthly']

function emptyForm() {
  return { name: '', prompt: '', schedule: '@daily', credentialId: '', model: '', enabled: true }
}

export default function SchedulerScreen() {
  const { token } = useAuth()
  const [jobs, setJobs]           = useState<Job[]>([])
  const [creds, setCreds]         = useState<Credential[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob]     = useState<Job | null>(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [running, setRunning]     = useState<string | null>(null)
  const [toggling, setToggling]   = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [error, setError]         = useState('')

  const loadJobs = useCallback(async () => {
    try {
      const [jobData, credData] = await Promise.all([
        api.get('/scheduler/jobs', token ?? undefined) as Promise<Job[]>,
        api.get('/credentials', token ?? undefined) as Promise<Credential[]>
      ])
      setJobs(jobData)
      setCreds(credData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadJobs() }, [loadJobs])

  function openCreate() {
    setEditJob(null)
    setForm(emptyForm())
    setError('')
    setShowModal(true)
  }

  function openEdit(job: Job) {
    setEditJob(job)
    setForm({
      name: job.name,
      prompt: job.prompt,
      schedule: job.schedule,
      credentialId: job.credentialId ?? '',
      model: job.model ?? '',
      enabled: job.enabled
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return setError('Name is required')
    if (!form.prompt.trim()) return setError('Prompt is required')
    if (!form.schedule.trim()) return setError('Schedule is required')
    setSaving(true)
    setError('')
    try {
      const body = {
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        schedule: form.schedule.trim(),
        credentialId: form.credentialId || null,
        model: form.model.trim() || null,
        enabled: form.enabled
      }
      if (editJob) {
        await api.put(`/scheduler/jobs/${editJob.id}`, body, token ?? undefined)
      } else {
        await api.post('/scheduler/jobs', body, token ?? undefined)
      }
      setShowModal(false)
      loadJobs()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(job: Job) {
    Alert.alert('Delete job', `Delete "${job.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/scheduler/jobs/${job.id}`, token ?? undefined)
            loadJobs()
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed')
          }
        }
      }
    ])
  }

  async function runNow(job: Job) {
    setRunning(job.id)
    try {
      await api.post(`/scheduler/jobs/${job.id}/run`, {}, token ?? undefined)
      Alert.alert('Job started', `"${job.name}" is running.`)
      setTimeout(loadJobs, 2000)
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunning(null)
    }
  }

  async function toggleJob(job: Job) {
    setToggling(job.id)
    try {
      await api.put(`/scheduler/jobs/${job.id}`, { ...job, enabled: !job.enabled }, token ?? undefined)
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: !j.enabled } : j))
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  const enabledCount = jobs.filter(j => j.enabled).length

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>📅 Scheduler</Text>
          <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
            {jobs.length} jobs · {enabledCount} enabled
          </Text>
        </View>
        <TouchableOpacity onPress={openCreate} style={{ backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>+ New job</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={{ color: '#f87171', padding: 16, fontSize: 13 }}>{error}</Text> : null}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>📅</Text>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>No scheduled jobs</Text>
              <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
                Create recurring tasks that Claude runs automatically.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ backgroundColor: '#111827', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden' }}>
              {/* Row */}
              <TouchableOpacity onPress={() => setExpanded(expanded === item.id ? null : item.id)} style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.enabled ? '#34d399' : '#4b5563' }} />
                      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>{item.name}</Text>
                    </View>
                    <Text style={{ color: '#6b7280', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{item.schedule}</Text>
                    {item.nextRunAt && item.enabled && (
                      <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>Next: {relativeTimeFuture(item.nextRunAt)}</Text>
                    )}
                  </View>
                  {/* Actions */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => runNow(item)}
                      disabled={!!running}
                      style={{ backgroundColor: '#1e3a5f', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                    >
                      {running === item.id
                        ? <ActivityIndicator color="#60a5fa" size="small" />
                        : <Text style={{ color: '#60a5fa', fontSize: 13 }}>▶</Text>
                      }
                    </TouchableOpacity>
                    {toggling === item.id ? (
                      <ActivityIndicator color="#3b82f6" size="small" />
                    ) : (
                      <Switch
                        value={item.enabled}
                        onValueChange={() => toggleJob(item)}
                        trackColor={{ false: '#374151', true: '#2563eb' }}
                        thumbColor="#ffffff"
                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {/* Expanded detail */}
              {expanded === item.id && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#1f2937', padding: 14 }}>
                  <Text style={{ color: '#9ca3af', fontSize: 12, lineHeight: 18, marginBottom: 10 }} numberOfLines={4}>
                    {item.prompt}
                  </Text>
                  {item.lastRunAt && (
                    <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>
                      Last run: {relativeTime(item.lastRunAt)}
                    </Text>
                  )}
                  {item.lastResultSummary && (
                    <Text style={{ color: '#d1d5db', fontSize: 12, marginBottom: 8 }} numberOfLines={3}>
                      {item.lastResultSummary}
                    </Text>
                  )}
                  {item.lastError && (
                    <Text style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>Error: {item.lastError}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => openEdit(item)} style={{ flex: 1, backgroundColor: '#374151', borderRadius: 8, padding: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#d1d5db', fontSize: 13 }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(item)} style={{ flex: 1, backgroundColor: '#7f1d1d', borderRadius: 8, padding: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#fca5a5', fontSize: 13 }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0f172a' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', flex: 1 }}>
              {editJob ? 'Edit job' : 'New scheduled job'}
            </Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Field label="Job name">
              <TextInput value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="Daily briefing" placeholderTextColor="#4b5563"
                style={inputStyle} />
            </Field>

            {/* Schedule */}
            <Field label="Schedule">
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {SHORTHANDS.map(s => (
                  <TouchableOpacity key={s} onPress={() => setForm(f => ({ ...f, schedule: s }))}
                    style={{ backgroundColor: form.schedule === s ? '#2563eb' : '#1f2937', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: form.schedule === s ? '#ffffff' : '#9ca3af', fontSize: 12 }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput value={form.schedule} onChangeText={v => setForm(f => ({ ...f, schedule: v }))}
                placeholder="0 9 * * *" placeholderTextColor="#4b5563" autoCapitalize="none"
                style={{ ...inputStyle, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} />
            </Field>

            {/* Prompt */}
            <Field label="Prompt">
              <TextInput value={form.prompt} onChangeText={v => setForm(f => ({ ...f, prompt: v }))}
                placeholder="Write a daily summary of…" placeholderTextColor="#4b5563"
                multiline numberOfLines={5}
                style={{ ...inputStyle, minHeight: 100, textAlignVertical: 'top' }} />
            </Field>

            {/* Credential */}
            {creds.length > 0 && (
              <Field label="API credential (optional)">
                <View style={{ gap: 6 }}>
                  <TouchableOpacity onPress={() => setForm(f => ({ ...f, credentialId: '' }))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: !form.credentialId ? '#1e3a5f' : '#1f2937', borderRadius: 8 }}>
                    <Text style={{ color: !form.credentialId ? '#60a5fa' : '#6b7280', fontSize: 13 }}>Default credential</Text>
                  </TouchableOpacity>
                  {creds.map(c => (
                    <TouchableOpacity key={c.id} onPress={() => setForm(f => ({ ...f, credentialId: c.id }))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: form.credentialId === c.id ? '#1e3a5f' : '#1f2937', borderRadius: 8 }}>
                      <Text style={{ color: form.credentialId === c.id ? '#60a5fa' : '#9ca3af', fontSize: 13 }}>{c.label}</Text>
                      <Text style={{ color: '#4b5563', fontSize: 11, fontFamily: 'monospace' }}>{c.model}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
            )}

            {/* Enabled */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>Enabled</Text>
              <Switch value={form.enabled} onValueChange={v => setForm(f => ({ ...f, enabled: v }))}
                trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#ffffff" />
            </View>

            {error ? <Text style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</Text> : null}

            <TouchableOpacity onPress={handleSave} disabled={saving}
              style={{ backgroundColor: '#2563eb', opacity: saving ? 0.6 : 1, borderRadius: 8, padding: 14, alignItems: 'center' }}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>Save job</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const inputStyle = {
  backgroundColor: '#1f2937' as const,
  borderWidth: 1,
  borderColor: '#374151' as const,
  borderRadius: 8,
  padding: 12,
  color: '#ffffff' as const,
  fontSize: 14
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>{label}</Text>
      {children}
    </View>
  )
}
