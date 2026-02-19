import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { api } from './utils/api'
import Setup from './pages/Setup'
import Login from './pages/Login'
import Chat from './pages/Chat'
import Tools from './pages/Tools'
import Memory from './pages/Memory'
import Audit from './pages/Audit'
import Settings from './pages/Settings'
import Layout from './components/Layout'

export default function App() {
  const [authState, setAuthState] = useState('loading') // 'loading' | 'firstRun' | 'login' | 'authenticated'
  const [token, setToken] = useState(() => localStorage.getItem('kiaros_token'))

  useEffect(() => {
    checkAuthStatus()
  }, [])

  async function checkAuthStatus() {
    try {
      const status = await api.get('/auth/status')
      if (status.firstRun) {
        setAuthState('firstRun')
      } else if (token) {
        // Verify token is still valid
        try {
          await api.get('/settings', token)
          setAuthState('authenticated')
        } catch {
          setToken(null)
          localStorage.removeItem('kiaros_token')
          setAuthState('login')
        }
      } else {
        setAuthState('login')
      }
    } catch (err) {
      setAuthState('login')
    }
  }

  function handleLogin(newToken) {
    setToken(newToken)
    localStorage.setItem('kiaros_token', newToken)
    setAuthState('authenticated')
  }

  function handleLogout() {
    if (token) {
      api.post('/auth/logout', {}, token).catch(() => {})
    }
    setToken(null)
    localStorage.removeItem('kiaros_token')
    setAuthState('login')
  }

  if (authState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-gray-400">Loading Kiaros...</div>
      </div>
    )
  }

  if (authState === 'firstRun') {
    return <Setup onComplete={() => setAuthState('login')} />
  }

  if (authState === 'login') {
    return <Login onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <Layout token={token} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<Chat token={token} />} />
          <Route path="/tools" element={<Tools token={token} />} />
          <Route path="/memory" element={<Memory token={token} />} />
          <Route path="/audit" element={<Audit token={token} />} />
          <Route path="/settings" element={<Settings token={token} />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
