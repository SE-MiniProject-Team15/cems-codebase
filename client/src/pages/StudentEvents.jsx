
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPublicEvents } from '../services/api'

function StudentEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getPublicEvents()
      .then((response) => {
        setEvents(response.data?.events || [])
      })
      .catch((err) => {
        setError(
          err.response?.data?.message ||
          'Could not load events. Please try again.'
        )
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="auth-page event-page">
      <section className="auth-card event-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Explore Events</h1>
        <p>Discover upcoming college events.</p>
        <Link to="/student/dashboard">Back to dashboard</Link>

        {loading && <p>Loading events...</p>}
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
