
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getPublicEvents } from '../services/api'
import useAuth from '../context/useAuth'

function StudentEvents() {
  const { user, loading: authLoading } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading || user?.role !== 'Student') return

    let active = true

    async function loadEvents() {
      try {
        const response = await getPublicEvents()
        if (active) setEvents(response.data?.events || [])
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              'Could not load events. Please try again.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadEvents()

    return () => {
      active = false
    }
  }, [authLoading, user])

  if (authLoading) {
    return <main className="auth-page"><p>Loading your account...</p></main>
  }

  if (!user) return <Navigate to="/login" replace />

  if (user.role !== 'Student') {
    const dashboard = {
      Organizer: '/organizer/dashboard',
      Admin: '/admin/dashboard',
    }[user.role]
    return <Navigate to={dashboard || '/login'} replace />
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-page event-page">
      <section className="auth-card event-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Explore Events</h1>
        <p>Discover upcoming college events.</p>
        <Link to="/student/dashboard">Back to dashboard</Link>

        {loading && <p role="status">Loading events...</p>}
        {error && <p role="alert">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <p>No approved events are available yet.</p>
        )}

        {events.map((event) => (
          <article className="event-list-item" key={event._id}>
            <h2>{event.title}</h2>
            <p>Category: {event.category}</p>
            <p>{event.description}</p>
            <p>Venue: {event.venue}</p>
            {event.startDateTime && (
              <p>
                Starts: {new Date(event.startDateTime).toLocaleString()}
              </p>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}

export default StudentEvents
