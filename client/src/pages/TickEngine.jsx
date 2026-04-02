import { useState, useEffect } from 'react'
import api from '../utils/api'

export default function TickEngine() {
  const [status, setStatus] = useState(null)
  const [tickLog, setTickLog] = useState([])
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState({ title: '', description: '', steps: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const [s, log, t] = await Promise.all([
        api.getTickStatus(),
        api.getTickLog(20),
        api.listTasks()
      ])
      setStatus(s)
      setTickLog(log)
      setTasks(t)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleEngine() {
    try {
      if (status?.running) {
        await api.stopTick()
      } else {
        await api.startTick()
      }
      loadAll()
    } catch (err) {
      alert(err.message)
    }
  }

  async function triggerTick() {
    try {
      const result = await api.triggerTick()
      loadAll()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault()
    if (!newTask.title) return
    try {
      const steps = newTask.steps ? newTask.steps.split('\n').filter(Boolean) : []
      await api.createTask(newTask.title, newTask.description, steps)
      setNewTask({ title: '', description: '', steps: '' })
      loadAll()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDeleteTask(id) {
    try {
      await api.deleteTask(id)
      loadAll()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>

  const decisionColors = {
    act: 'text-green-400',
    skip: 'text-gray-500',
    defer: 'text-yellow-400'
  }

  const taskStatusColors = {
    pending: 'badge bg-gray-700 text-gray-400',
    in_progress: 'badge-medium',
    completed: 'badge-low',
    failed: 'badge-high',
    paused: 'badge bg-blue-900/50 text-blue-400 border border-blue-800'
  }

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold mb-1">Tick Engine</h2>
      <p className="text-sm text-gray-500 mb-6">
        Kairos-inspired proactive evaluation loop. Periodically assesses state and decides whether to act.
      </p>

      {/* Engine Status */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Engine Status</h3>
            <div className="flex items-center gap-3 mt-1">
              <span className={`w-2 h-2 rounded-full ${status?.running ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-sm text-gray-400">
                {status?.running ? 'Running' : 'Stopped'}
                {status?.running && ` — tick #${status.tickNumber}, interval ${status.intervalMs / 1000}s`}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={triggerTick} className="btn-ghost text-sm">
              Trigger Tick
            </button>
            <button onClick={toggleEngine} className={status?.running ? 'btn-danger text-sm' : 'btn-primary text-sm'}>
              {status?.running ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Max Autonomous Risk:</span>
            <span className="ml-2 text-gray-300">{status?.maxAutonomousRisk || 'low'}</span>
          </div>
          <div>
            <span className="text-gray-500">Idle:</span>
            <span className="ml-2 text-gray-300">{Math.round((status?.idleMs || 0) / 1000)}s</span>
          </div>
          <div>
            <span className="text-gray-500">Total Ticks:</span>
            <span className="ml-2 text-gray-300">{status?.tickNumber || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Tasks */}
        <div>
          <h3 className="font-semibold mb-3">Tasks</h3>

          <form onSubmit={handleCreateTask} className="card mb-4 space-y-2">
            <input
              className="input text-sm"
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="Description (optional)"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            />
            <textarea
              className="input text-sm"
              placeholder="Steps (one per line, optional)"
              rows={3}
              value={newTask.steps}
              onChange={(e) => setNewTask({ ...newTask, steps: e.target.value })}
            />
            <button type="submit" className="btn-primary text-sm" disabled={!newTask.title}>
              Create Task
            </button>
          </form>

          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-gray-600 text-sm">No tasks.</p>
            ) : tasks.map(task => (
              <div key={task.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-sm">{task.title}</h4>
                    {task.description && <p className="text-xs text-gray-500">{task.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={taskStatusColors[task.status]}>{task.status}</span>
                      {task.steps.length > 0 && (
                        <span className="text-xs text-gray-500">
                          Step {task.current_step}/{task.steps.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTask(task.id)} className="text-xs text-red-400 hover:text-red-300">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tick Log */}
        <div>
          <h3 className="font-semibold mb-3">Tick Log</h3>
          <div className="space-y-2">
            {tickLog.length === 0 ? (
              <p className="text-gray-600 text-sm">No ticks recorded.</p>
            ) : tickLog.map(t => (
              <div key={t.id} className="card py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">#{t.tick_number}</span>
                  <span className={decisionColors[t.decision]}>{t.decision}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t.context_summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
