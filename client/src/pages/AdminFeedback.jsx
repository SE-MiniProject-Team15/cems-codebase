import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import useAuth from '../context/useAuth'
import { getPublicEvents } from '../services/api'
import FeedbackSummary from '../components/FeedbackSummary'

function AdminFeedback() {
  const { user, loading: authLoading } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedbackEvent, setFeedbackEvent] = useState(null)

  useEffect(() => {
    let active = true
    getPublicEvents()
      .then((response) => {
        if (active) {
          setEvents(
            response.data.events.filter(
              (event) => new Date(event.endDateTime) <= new Date()
            )
          )
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message || 'Could not load past events.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (authLoading) {
    return <main className="events-page"><p className="events-status">Loading account...</p></main>
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Admin') {
    const dashboard = user.role === 'Student'
      ? '/student/dashboard'
      : '/organizer/dashboard'
    return <Navigate to={dashboard} replace />
  }

  return (
    <main className="events-page">
      <header className="events-header">
        <Link className="events-brand" to="/admin/dashboard">CEMS</Link>
        <div><Link to="/admin/dashboard">Dashboard</Link></div>
      </header>
      <section className="events-content">
        <div className="events-heading">
          <div>
            <p className="auth-eyebrow">Administrator</p>
            <h1>Event feedback</h1>
            <p>Anonymous ratings and comments for completed events.</p>
          </div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {loading && <p className="events-status">Loading past events...</p>}
        {!loading && !error && events.length === 0 && (
          <div className="events-empty"><p>No completed public events to show.</p></div>
        )}
        {!loading && events.length > 0 && (
          <div className="registration-grid">
            {events.map((event) => (
              <article className="registration-card" key={event._id}>
                <p className="event-category">{event.category}</p>
                <h2>{event.title}</h2>
                <p><strong>Ended:</strong> {new Date(event.endDateTime).toLocaleString()}</p>
                <button
                  className="auth-button"
                  type="button"
                  onClick={() => setFeedbackEvent(event)}
                >
                  View Feedback
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {feedbackEvent && (
        <FeedbackSummary
          eventId={feedbackEvent._id}
          eventTitle={feedbackEvent.title}
          onClose={() => setFeedbackEvent(null)}
        />
      )}
    </main>
  )
}

export default AdminFeedback
