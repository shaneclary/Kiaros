import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import api from './utils/api'
import Chat from './pages/Chat'
import Tools from './pages/Tools'
import Memory from './pages/Memory'
import Audit from './pages/Audit'
import TickEngine from './pages/TickEngine'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Setup from './pages/Setup'

function Layout({ children, onLogout }) {
  const navItems = [
    { to: '/chat', label: 'Chat' },
    { to: '/tools', label: 'Tools' },
    { to: '/memory', label: 'Memory' },
    { to: '/tick', label: 'Tick Engine' },
    { to: '/audit', label: 'Audit' },
    { to: '/settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-kiaros-400">KIAROS</h1>
          <p className="text-xs text-gray-500 mt-1">v2.0.0 — AI Engine</p>
        </div>

        <div className="flex-1 space-y-1">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-kiaros-600/20 text-kiaros-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        <button onClick={onLogout} className="btn-ghost text-sm text-gray-500 mt-4">
          Logout
        </button>
      </nav>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState('loading') // loading | setup | login | app
  const [error, setError] = useState(null)

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const status = await api.getStatus()
      if (status.firstRun) {
        setState('setup')
      } else if (api.getToken()) {
        setState('app')
      } else {
        setState('login')
      }
    } catch {
      setState('login')
    }
  }

  function handleAuth(token, passphrase) {
    api.setToken(token)
    api.setPassphrase(passphrase)
    setState('app')
  }

  function handleLogout() {
    api.logout().catch(() => {})
    api.clearToken()
    setState('login')
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-kiaros-400 text-lg">Loading Kiaros...</div>
      </div>
    )
  }

  if (state === 'setup') {
    return <Setup onComplete={handleAuth} />
  }

  if (state === 'login') {
    return <Login onLogin={handleAuth} />
  }

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout}>
        <Routes>
          <Route path="/chat" element={<Chat />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/tick" element={<TickEngine />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/chat" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
