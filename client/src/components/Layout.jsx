import React from 'react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/chat',      label: 'Chat',      icon: '💬' },
  { path: '/tools',     label: 'Tools',     icon: '🔧' },
  { path: '/memory',    label: 'Memory',    icon: '🧠' },
  { path: '/scheduler', label: 'Scheduler', icon: '📅' },
  { path: '/documents', label: 'Documents', icon: '📄' },
  { path: '/search',    label: 'Search',    icon: '🔍' },
  { path: '/audit',     label: 'Audit',     icon: '📋' },
  { path: '/settings',  label: 'Settings',  icon: '⚙️' },
]

export default function Layout({ children, onLogout }) {
  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">⚡ Kiaros</h1>
          <p className="text-xs text-gray-500 mt-0.5">v2.0</p>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-800">
          <button
            onClick={onLogout}
            className="w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors text-left"
          >
            🔒 Lock
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
