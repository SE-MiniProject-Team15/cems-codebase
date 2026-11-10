import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import useAuth from '../context/useAuth'
import { getNotifications, markNotificationAsRead } from '../services/api'

const dashboards = {
  Student: '/student/dashboard',
  Organizer: '/organizer/dashboard',
  Admin: '/admin/dashboard',
}

function Notifications() {
  const { user, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (authLoading || !user) return
    let active = true

    getNotifications()
      .then((response) => {
        if (active) setNotifications(response.data?.notifications || [])
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || 'Could not load notifications.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [authLoading, user])

  async function markRead(id) {
    if (busyId) return
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      const response = await markNotificationAsRead(id)
      setNotifications((current) => current.map((item) =>
        item._id === id ? response.data?.notification || { ...item, read: true } : item
      ))
      setMessage('Notification marked as read.')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not mark notification as read.')
    } finally {
      setBusyId(null)
    }
  }

  if (authLoading) return <main id="main-content" tabIndex={-1} className="auth-page"><p>Loading your account...</p></main>
  if (!user) return <Navigate to="/login" replace />

  return (
    <main id="main-content" tabIndex={-1} className="auth-page event-page">
      <section className="auth-card event-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Notifications</h1>
        <Link to={dashboards[user.role] || '/login'}>Back to dashboard</Link>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {loading && <p role="status">Loading notifications...</p>}
        {!loading && !error && notifications.length === 0 && <p>No notifications yet.</p>}
        <div className="event-list">
          {notifications.map((item) => (
            <article className="event-list-item" key={item._id}>
              <h2>{item.title}</h2>
              <p>{item.message}</p>
              <p>{item.read ? 'Read' : 'Unread'}</p>
              {item.createdAt && <p>{new Date(item.createdAt).toLocaleString()}</p>}
              {!item.read && (
                <button className="auth-button" type="button" disabled={Boolean(busyId)} onClick={() => markRead(item._id)}>
                  {busyId === item._id ? 'Saving...' : 'Mark as read'}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default Notifications
