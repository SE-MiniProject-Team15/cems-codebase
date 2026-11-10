import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import useAuth from '../context/useAuth'
import {
  decideEvent,
  getPendingEventDetails,
  getPendingEvents,
} from '../services/api'

const MIN_DECISION_COMMENT_LENGTH = 10
const MAX_DECISION_COMMENT_LENGTH = 1000

function formatDate(value) {
  if (!value) return 'Not provided'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString()
}

function AdminEventReview() {
  const { user, loading: authLoading } = useAuth()
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true)
    setError('')
    try {
      const response = await getPendingEvents()
      setEvents(response.data?.events || [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load pending events.')
    } finally {
      setLoadingQueue(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading || user?.role !== 'Admin') return

    let active = true
    getPendingEvents()
      .then((response) => {
        if (active) setEvents(response.data?.events || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.message || 'Could not load pending events.')
        }
      })
      .finally(() => {
        if (active) setLoadingQueue(false)
      })

    return () => {
      active = false
    }
  }, [authLoading, user])

  async function openEvent(id) {
    setSelectedEvent(null)
    setComment('')
    setMessage('')
    setError('')
    setLoadingDetails(true)
    try {
      const response = await getPendingEventDetails(id)
      setSelectedEvent(response.data?.event || null)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load event details.')
    } finally {
      setLoadingDetails(false)
    }
  }

  async function submitDecision(action) {
    if (!selectedEvent || submitting) return
    const trimmedComment = comment.trim()
    if (action === 'reject' && !trimmedComment) {
      setError('A rejection reason is required.')
      return
    }
    if (action === 'request_changes' && !trimmedComment) {
      setError('Comments are required when requesting changes.')
      return
    }
    if (
      action !== 'approve' &&
      trimmedComment.length < MIN_DECISION_COMMENT_LENGTH
    ) {
      setError(
        `Please provide at least ${MIN_DECISION_COMMENT_LENGTH} characters.`
      )
      return
    }
    if (trimmedComment.length > MAX_DECISION_COMMENT_LENGTH) {
      setError(
        `Decision comments cannot exceed ${MAX_DECISION_COMMENT_LENGTH} characters.`
      )
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')

    const payload = {
      action,
      ...(action === 'reject' && { reason: trimmedComment }),
      ...(action === 'request_changes' && { comments: trimmedComment }),
    }

    try {
      const response = await decideEvent(selectedEvent._id, payload)
      setMessage(response.message || 'Decision recorded.')
      setSelectedEvent(null)
      setComment('')
      await loadQueue()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not record the decision.')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return <main className="auth-page"><p>Loading your account...</p></main>
  }

  if (!user) return <Navigate to="/login" replace />

  if (user.role !== 'Admin') {
    const dashboard = {
      Student: '/student/dashboard',
      Organizer: '/organizer/dashboard',
    }[user.role]
    return <Navigate to={dashboard || '/login'} replace />
  }

  return (
    <main className="auth-page event-page">
      <section className="auth-card event-card approval-page">
        <p className="auth-eyebrow">Administrator tools</p>
        <h1>Event approvals</h1>
        <p>Review submitted event details and record an approval decision.</p>
        <p><Link to="/admin/dashboard">Back to dashboard</Link></p>

        {message && <p className="approval-success" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="approval-layout">
          <section aria-labelledby="pending-events-heading">
            <div className="approval-section-heading">
              <h2 id="pending-events-heading">Pending events</h2>
              <button
                className="auth-button secondary-button"
                type="button"
                onClick={loadQueue}
                disabled={loadingQueue}
              >
                {loadingQueue ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {loadingQueue && <p role="status">Loading pending events...</p>}
            {!loadingQueue && events.length === 0 && (
              <p>No events are waiting for review.</p>
            )}
            <div className="approval-queue">
              {events.map((event) => (
                <article className="event-list-item" key={event._id}>
                  <h3>{event.title}</h3>
                  <p><strong>Status:</strong> {event.status}</p>
                  <p><strong>Category:</strong> {event.category}</p>
                  <p><strong>Organizer:</strong> {event.organizer?.name || event.organizer}</p>
                  <p><strong>Starts:</strong> {formatDate(event.startDateTime)}</p>
                  <button
                    className="auth-button"
                    type="button"
                    disabled={loadingDetails || submitting}
                    onClick={() => openEvent(event._id)}
                  >
                    Review details
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="event-details-heading">
            <h2 id="event-details-heading">Event details</h2>
            {loadingDetails && <p role="status">Loading event details...</p>}
            {!loadingDetails && !selectedEvent && (
              <p>Select a pending event to inspect its details.</p>
            )}
            {selectedEvent && (
              <article className="event-list-item approval-details">
                <h3>{selectedEvent.title}</h3>
                <p><strong>Category:</strong> {selectedEvent.category}</p>
                <p><strong>Description:</strong> {selectedEvent.description}</p>
                <p><strong>Venue:</strong> {selectedEvent.venue}</p>
                <p><strong>Department:</strong> {selectedEvent.department}</p>
                <p><strong>Starts:</strong> {formatDate(selectedEvent.startDateTime)}</p>
                <p><strong>Ends:</strong> {formatDate(selectedEvent.endDateTime)}</p>
                <p><strong>Registration deadline:</strong> {formatDate(selectedEvent.registrationDeadline)}</p>
                <p><strong>Capacity:</strong> {selectedEvent.capacity}</p>
                <p><strong>Organizer:</strong> {selectedEvent.organizer?.name || selectedEvent.organizer}</p>
                {selectedEvent.bannerUrl && (
                  <p><a href={selectedEvent.bannerUrl} target="_blank" rel="noreferrer">View event banner</a></p>
                )}

                <label htmlFor="decision-comments">Reason or comments</label>
                <textarea
                  id="decision-comments"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={4}
                  minLength={MIN_DECISION_COMMENT_LENGTH}
                  maxLength={MAX_DECISION_COMMENT_LENGTH}
                  aria-describedby="decision-comments-help"
                  placeholder="Required for rejection or requested changes"
                  disabled={submitting}
                />
                <p id="decision-comments-help">
                  Rejection reasons and change requests must be at least {MIN_DECISION_COMMENT_LENGTH} characters.
                </p>
                <div className="event-actions">
                  <button
                    className="auth-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => submitDecision('approve')}
                  >
                    {submitting ? 'Saving...' : 'Approve'}
                  </button>
                  <button
                    className="auth-button secondary-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => submitDecision('request_changes')}
                  >
                    Request changes
                  </button>
                  <button
                    className="auth-button danger-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => submitDecision('reject')}
                  >
                    Reject
                  </button>
                </div>
              </article>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminEventReview
