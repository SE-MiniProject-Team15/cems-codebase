import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import useAuth from '../context/useAuth'
import {
  cancelRegistration,
  getEvent,
  getEvents,
  getMyRegistrations,
  registerForEvent,
} from '../services/api'

const dateTime = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

function StudentOnly({ user, loading, children }) {
  if (loading) return <main id="main-content" tabIndex={-1} className="events-page"><p role="status" className="events-status">Loading account...</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Student') return <Navigate to="/login" replace />
  return children
}

function EventBrowser() {
  const { user, loading: authLoading } = useAuth()
  const [params, setParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getEvents(Object.fromEntries(params.entries()))
      .then(({ data }) => { if (active) { setEvents(data.events); setPagination(data.pagination) } })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load events.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params])

  function applyFilters(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const next = new URLSearchParams()
    for (const [key, value] of new FormData(e.currentTarget).entries()) if (value) next.set(key, value)
    setParams(next)
  }

  function changePage(page) {
    setError('')
    setLoading(true)
    const next = new URLSearchParams(params)
    next.set('page', String(page))
    setParams(next)
  }

  return <StudentOnly user={user} loading={authLoading}>
    <main id="main-content" tabIndex={-1} className="events-page">
      <header className="events-header"><Link className="events-brand" to="/student/dashboard">CEMS</Link><div><span>Campus events</span><Link to="/student/dashboard">Dashboard</Link></div></header>
      <section className="events-content">
        <div className="events-heading"><div><p className="auth-eyebrow">Student events</p><h1>Find your next campus event</h1><p>Browse approved events from across campus.</p></div><span role="status" className="events-count">{pagination.total} events</span></div>
        <form className="event-filters" onSubmit={applyFilters}>
          <label className="event-search">Search<input name="q" type="search" maxLength="100" defaultValue={params.get('q') || ''} placeholder="Title or description" /></label>
          <label>Category<input name="category" maxLength="80" defaultValue={params.get('category') || ''} /></label>
          <label>Venue<input name="venue" maxLength="160" defaultValue={params.get('venue') || ''} /></label>
          <label>Department<input name="department" maxLength="120" defaultValue={params.get('department') || ''} /></label>
          <label>From<input name="dateFrom" type="date" defaultValue={params.get('dateFrom') || ''} /></label>
          <label>To<input name="dateTo" type="date" defaultValue={params.get('dateTo') || ''} /></label>
          <label>Sort<select name="sort" defaultValue={params.get('sort') || 'date'}><option value="date">Soonest</option><option value="popular">Most registered</option></select></label>
          <button className="auth-button" type="submit">Apply filters</button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {loading ? <p role="status" className="events-status">Loading events...</p> : events.length === 0 ? <div className="events-empty"><h2>No events found</h2><p>Try changing your filters. Approved events will appear here.</p></div> : <div className="event-grid">
          {events.map((item) => <article className="event-card" key={item.id}>
            {item.bannerUrl && <img className="event-banner" src={item.bannerUrl} alt="" loading="lazy" />}
            <div className="event-card-body"><p className="event-category">{item.category}</p><h2><Link to={'/events/' + item.id}>{item.title}</Link></h2><p className="event-summary">{item.description}</p>
              <dl><div><dt>When</dt><dd>{dateTime(item.startDateTime)}</dd></div><div><dt>Where</dt><dd>{item.venue}</dd></div><div><dt>Department</dt><dd>{item.department}</dd></div></dl>
              <p className="event-seats">{item.remainingSeats} seats remaining</p><Link className="event-link" to={'/events/' + item.id} aria-label={`View details for ${item.title}`}>View details</Link>
            </div>
          </article>)}
        </div>}
        {!loading && pagination.totalPages > 1 && <nav className="event-pagination" aria-label="Event pages"><button type="button" onClick={() => changePage(pagination.page - 1)} disabled={pagination.page <= 1}>Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" onClick={() => changePage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</button></nav>}
      </section>
    </main>
  </StudentOnly>
}

function EventDetails() {
  const { eventId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [registration, setRegistration] = useState(null)
  const [registrationLoading, setRegistrationLoading] = useState(true)
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false)
  const [registrationError, setRegistrationError] = useState('')
  const [registrationMessage, setRegistrationMessage] = useState('')

  useEffect(() => {
    let active = true

    getEvent(eventId)
      .then(({ data }) => {
        if (active) setEvent(data.event)
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || 'Could not load this event.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    getMyRegistrations()
      .then(({ data }) => {
        if (active) {
          setRegistration(
            data.registrations.find((item) => item.event.id === eventId) || null
          )
        }
      })
      .catch((err) => {
        if (active) {
          setRegistrationError(
            err.response?.data?.message || 'Could not check your registration status.'
          )
        }
      })
      .finally(() => {
        if (active) setRegistrationLoading(false)
      })

    return () => { active = false }
  }, [eventId])


  async function submitRegistration() {
    setRegistrationSubmitting(true)
    setRegistrationError('')
    setRegistrationMessage('')
    try {
      const response = await registerForEvent(eventId)
      const createdRegistration = response.data.registration
      setRegistration(createdRegistration)
      setRegistrationMessage(
        response.data.notificationSaved === false
          ? `${response.message} The confirmation notification could not be saved.`
          : response.message
      )
      if (createdRegistration.status === 'Registered') {
        setEvent((current) => ({
          ...current,
          remainingSeats: Math.max(0, current.remainingSeats - 1),
        }))
      }
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.message || 'Could not register for this event.'
      )
    } finally {
      setRegistrationSubmitting(false)
    }
  }

  async function submitCancellation() {
    setRegistrationSubmitting(true)
    setRegistrationError('')
    setRegistrationMessage('')
    try {
      const wasRegistered = registration.status === 'Registered'
      const response = await cancelRegistration(eventId)
      setRegistration(null)
      setRegistrationMessage(
        response.data.promotionNotificationSaved === false
          ? `${response.message} The promoted student could not be notified.`
          : response.message
      )
      if (wasRegistered && !response.data.promoted) {
        setEvent((current) => ({
          ...current,
          remainingSeats: Math.min(current.capacity, current.remainingSeats + 1),
        }))
      }
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.message || 'Could not cancel this registration.'
      )
    } finally {
      setRegistrationSubmitting(false)
    }
  }

  const registrationOpen = event &&
    new Date(event.registrationDeadline) > new Date() &&
    new Date(event.startDateTime) > new Date()

  return (
    <StudentOnly user={user} loading={authLoading}>
      <main id="main-content" tabIndex={-1} className="events-page">
        <header className="events-header">
          <Link className="events-brand" to="/events">CEMS</Link>
          <div>
            <Link to="/events">All events</Link>
            <Link to="/registrations">My tickets</Link>
          </div>
        </header>
        <section className="events-content event-detail">
          <Link className="event-link" to="/events">← Back to events</Link>
          {loading && <p role="status" className="events-status">Loading event...</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {event && (
            <article>
              {event.bannerUrl && (
                <img className="event-detail-banner" src={event.bannerUrl} alt="" />
              )}
              <p className="event-category">{event.category}</p>
              <h1>{event.title}</h1>
              <p className="event-detail-description">{event.description}</p>
              <dl className="event-facts">
                <div><dt>Starts</dt><dd>{dateTime(event.startDateTime)}</dd></div>
                <div><dt>Ends</dt><dd>{dateTime(event.endDateTime)}</dd></div>
                <div><dt>Venue</dt><dd>{event.venue}</dd></div>
                <div><dt>Department</dt><dd>{event.department}</dd></div>
                <div><dt>Registration deadline</dt><dd>{dateTime(event.registrationDeadline)}</dd></div>
                <div><dt>Availability</dt><dd>{event.remainingSeats} seats remaining</dd></div>
              </dl>

              <section className="registration-actions" aria-label="Event registration">
                <h2>Your registration</h2>
                {registrationLoading && <p>Checking registration status...</p>}
                {registrationError && <p className="auth-error" role="alert">{registrationError}</p>}
                {registrationMessage && <p className="registration-success" role="status">{registrationMessage}</p>}
                {!registrationLoading && registration && (
                  <div>
                    <p>
                      Status: <strong>{registration.status}</strong>
                      {registration.status === 'Registered'
                        ? ' — your ticket is ready.'
                        : ' — you will be notified if a seat opens.'}
                    </p>
                    <button
                      className="auth-button secondary-button"
                      type="button"
                      onClick={submitCancellation}
                      disabled={registrationSubmitting || !registrationOpen}
                    >
                      {registrationSubmitting
                        ? 'Cancelling...'
                        : registration.status === 'Waitlisted'
                          ? 'Leave waitlist'
                          : 'Cancel registration'}
                    </button>
                  </div>
                )}
                {!registrationLoading && !registration && registrationOpen && (
                  <button
                    className="auth-button"
                    type="button"
                    onClick={submitRegistration}
                    disabled={registrationSubmitting}
                  >
                    {registrationSubmitting
                      ? 'Submitting...'
                      : event.remainingSeats > 0
                        ? 'Register for event'
                        : 'Join waitlist'}
                  </button>
                )}
                {!registrationLoading && !registration && !registrationOpen && (
                  <p>Registration is closed for this event.</p>
                )}
                <p><Link to="/registrations">View all registrations and tickets</Link></p>
              </section>
            </article>
          )}
        </section>
      </main>
    </StudentOnly>
  )

}

export { EventBrowser, EventDetails }
