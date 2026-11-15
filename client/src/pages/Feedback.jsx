import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import useAuth from '../context/useAuth'
import {
  getAdminFeedbackSummary,
  getEligibleFeedbackEvents,
  getEventFeedback,
  getMyEvents,
  getMyEventFeedback,
  submitEventFeedback,
} from '../services/api'

function FeedbackReport({ report }) {
  const { averageRating, totalResponses, ratingDistribution, feedback } = report

  return (
    <div className="feedback-report">
      {totalResponses === 0 ? (
        <p>No feedback submitted yet.</p>
      ) : (
        <>
          <p>
            Average rating: <strong>{averageRating.toFixed(2)} / 5</strong>
            {' · '}
            {totalResponses} response{totalResponses === 1 ? '' : 's'}
          </p>
          <ul className="feedback-distribution">
            {[5, 4, 3, 2, 1].map((rating) => (
              <li key={rating}>
                {rating} star{rating === 1 ? '' : 's'}: {ratingDistribution[rating]}
              </li>
            ))}
          </ul>
          <h3>Anonymous comments</h3>
          {feedback.length === 0 ? (
            <p>No written comments.</p>
          ) : (
            <ul className="feedback-comments">
              {feedback.map((entry, index) => (
                <li key={`${entry.createdAt}-${index}`}>
                  <p aria-label={`${entry.rating} out of 5 stars`}>
                    {'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}
                  </p>
                  {entry.comment && <p>{entry.comment}</p>}
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function StudentFeedbackCard({ event }) {
  const [feedback, setFeedback] = useState(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getMyEventFeedback(event.id)
      .then((response) => {
        if (active) {
          setFeedback(response.data.feedback)
          setLoaded(true)
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message || 'Could not load your feedback.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [event.id])

  async function submit(eventObject) {
    eventObject.preventDefault()
    if (!rating || submitting) return

    setSubmitting(true)
    setError('')
    try {
      const response = await submitEventFeedback(event.id, {
        rating,
        comment,
      })
      setFeedback(response.data.feedback)
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || 'Could not submit your feedback.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="event-list-item feedback-card">
      <h2>{event.title}</h2>
      <p>Ended {new Date(event.endDateTime).toLocaleString()}</p>
      {loading && <p role="status">Loading feedback...</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!loading && loaded && feedback && (
        <div className="feedback-readonly">
          <p>
            Your rating: <strong>{feedback.rating} / 5</strong>
          </p>
          {feedback.comment && <p>{feedback.comment}</p>}
          <p>This feedback is submitted and can no longer be changed.</p>
        </div>
      )}
      {!loading && loaded && !feedback && (
        <form className="feedback-form" onSubmit={submit}>
          <fieldset>
            <legend>Rate this event</legend>
            <div className="feedback-stars" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  aria-pressed={rating === value}
                  className={rating >= value ? 'feedback-star selected' : 'feedback-star'}
                  key={value}
                  onClick={() => setRating(value)}
                  type="button"
                >
                  ★
                </button>
              ))}
            </div>
          </fieldset>
          <label htmlFor={`feedback-comment-${event.id}`}>Comment (optional)</label>
          <textarea
            id={`feedback-comment-${event.id}`}
            maxLength={1000}
            onChange={(changeEvent) => setComment(changeEvent.target.value)}
            rows={4}
            value={comment}
          />
          <p>{comment.length}/1000 characters</p>
          <button className="auth-button" disabled={!rating || submitting} type="submit">
            {submitting ? 'Submitting...' : 'Submit feedback'}
          </button>
        </form>
      )}
    </article>
  )
}

function StudentFeedback() {
  const { user, loading } = useAuth()
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || user?.role !== 'Student') return undefined

    let active = true
    getEligibleFeedbackEvents()
      .then((response) => {
        if (active) setEvents(response.data.events)
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message || 'Could not load completed events.'
          )
        }
      })
      .finally(() => {
        if (active) setLoadingEvents(false)
      })

    return () => {
      active = false
    }
  }, [loading, user])

  if (loading) return <main className="events-page"><p role="status">Loading account...</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Student') return <Navigate to="/login" replace />

  return (
    <main className="events-page">
      <header className="events-header">
        <Link className="events-brand" to="/student/dashboard">CEMS</Link>
        <Link to="/student/dashboard">Dashboard</Link>
      </header>
      <section className="events-content">
        <div className="events-heading">
          <div>
            <p className="auth-eyebrow">Student</p>
            <h1>Event feedback</h1>
            <p>Share your experience for events you attended.</p>
          </div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {loadingEvents && <p role="status">Loading completed events...</p>}
        {!loadingEvents && !error && events.length === 0 && (
          <div className="events-empty">
            <h2>No attended events ready for feedback</h2>
            <p>Completed events you attended will appear here.</p>
          </div>
        )}
        <div className="feedback-event-list">
          {events.map((event) => (
            <StudentFeedbackCard event={event} key={event.id} />
          ))}
        </div>
      </section>
    </main>
  )
}

function OrganizerFeedback() {
  const { user, loading } = useAuth()
  const [events, setEvents] = useState([])
  const [reports, setReports] = useState({})
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (loading || user?.role !== 'Organizer') return undefined

    let active = true
    getMyEvents()
      .then((response) => {
        if (active) setEvents(response.data.events || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.message || 'Could not load your events.')
        }
      })
      .finally(() => {
        if (active) setLoadingEvents(false)
      })

    return () => {
      active = false
    }
  }, [loading, user])

  async function toggleReport(event) {
    if (selectedId === event._id) {
      setSelectedId('')
      return
    }
    setSelectedId(event._id)
    if (reports[event._id]) return

    try {
      const response = await getEventFeedback(event._id)
      setReports((current) => ({ ...current, [event._id]: response.data }))
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || 'Could not load event feedback.'
      )
    }
  }

  if (loading) return <main className="events-page"><p role="status">Loading account...</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Organizer') return <Navigate to="/login" replace />

  const endedEvents = events.filter((event) => {
    const endDateTime = event.status !== 'Approved' && event.approvedSnapshot
      ? event.approvedSnapshot.endDateTime
      : event.endDateTime
    return endDateTime && new Date(endDateTime) < new Date()
  })

  return (
    <main className="events-page">
      <header className="events-header">
        <Link className="events-brand" to="/organizer/dashboard">CEMS</Link>
        <Link to="/organizer/events">Your events</Link>
      </header>
      <section className="events-content">
        <div className="events-heading">
          <div>
            <p className="auth-eyebrow">Organizer</p>
            <h1>Event feedback</h1>
            <p>Review ratings and anonymous comments for your completed events.</p>
          </div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {loadingEvents && <p role="status">Loading your events...</p>}
        {!loadingEvents && !error && endedEvents.length === 0 && (
          <p>No completed events are available for feedback yet.</p>
        )}
        {endedEvents.map((event) => (
          <article className="event-list-item feedback-card" key={event._id}>
            <h2>{event.title}</h2>
            <button
              className="auth-button secondary-button"
              onClick={() => toggleReport(event)}
              type="button"
            >
              {selectedId === event._id ? 'Hide feedback' : 'View feedback'}
            </button>
            {selectedId === event._id && reports[event._id] && (
              <FeedbackReport report={reports[event._id]} />
            )}
          </article>
        ))}
      </section>
    </main>
  )
}

function AdminFeedback() {
  const { user, loading } = useAuth()
  const [events, setEvents] = useState([])
  const [loadingReport, setLoadingReport] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || user?.role !== 'Admin') return undefined

    let active = true
    getAdminFeedbackSummary()
      .then((response) => {
        if (active) setEvents(response.data.events || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message || 'Could not load feedback summary.'
          )
        }
      })
      .finally(() => {
        if (active) setLoadingReport(false)
      })

    return () => {
      active = false
    }
  }, [loading, user])

  if (loading) return <main className="events-page"><p role="status">Loading account...</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Admin') return <Navigate to="/login" replace />

  return (
    <main className="events-page">
      <header className="events-header">
        <Link className="events-brand" to="/admin/dashboard">CEMS</Link>
        <Link to="/admin/dashboard">Dashboard</Link>
      </header>
      <section className="events-content">
        <div className="events-heading">
          <div>
            <p className="auth-eyebrow">Administrator</p>
            <h1>College feedback summary</h1>
            <p>Ratings and anonymous comments across all events.</p>
          </div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {loadingReport && <p role="status">Loading feedback summary...</p>}
        {!loadingReport && !error && events.length === 0 && (
          <p>No events are available.</p>
        )}
        {events.map((event) => (
          <article className="event-list-item feedback-card" key={event.id}>
            <h2>{event.title || 'Untitled event'}</h2>
            <FeedbackReport report={event} />
          </article>
        ))}
      </section>
    </main>
  )
}

export { AdminFeedback, OrganizerFeedback, StudentFeedback }
