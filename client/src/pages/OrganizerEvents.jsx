
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  createEvent,
  getMyEvents,
  updateEvent,
  cancelEvent,
  getNotifications,
  markNotificationAsRead,
} from '../services/api';
import useAuth from '../context/useAuth';

const emptyForm = {
  title: '',
  category: 'Workshop',
  description: '',
  venue: '',
  department: '',
  startDateTime: '',
  endDateTime: '',
  capacity: '50',
  bannerUrl: '',
  registrationDeadline: '',
};

const fields = [
  ['title', 'Event title', 'text'],
  ['category', 'Category', 'text'],
  ['description', 'Description', 'textarea'],
  ['venue', 'Venue', 'text'],
  ['department', 'Department', 'text'],
  ['startDateTime', 'Start date and time', 'datetime-local'],
  ['endDateTime', 'End date and time', 'datetime-local'],
  ['capacity', 'Maximum capacity', 'number'],
  ['bannerUrl', 'Banner image URL', 'url'],
  ['registrationDeadline', 'Registration deadline', 'datetime-local'],
];

function toLocalDateTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16);
}

function toFormData(event) {
  return {
    title: event.title || '',
    category: event.category || 'Workshop',
    description: event.description || '',
    venue: event.venue || '',
    department: event.department || '',
    startDateTime: toLocalDateTime(event.startDateTime),
    endDateTime: toLocalDateTime(event.endDateTime),
    capacity: String(event.capacity ?? 50),
    bannerUrl: event.bannerUrl || '',
    registrationDeadline: toLocalDateTime(
      event.registrationDeadline
    ),
  };
}

function OrganizerEvents() {
  const { user, loading: authLoading, error: authError } = useAuth();

  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [decisionNotifications, setDecisionNotifications] = useState([]);
  const [markingNotificationId, setMarkingNotificationId] = useState(null);
  const [cancellingEventId, setCancellingEventId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const formRef = useRef(null);

  // Load events when the user explicitly refreshes or saves a change.
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await getMyEvents();
      setEvents(response.data?.events || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not load your events.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch events after authentication has completed.
  // The request updates state asynchronously and is cancelled on cleanup.
  useEffect(() => {
    if (authLoading) return;

    if (user?.role !== 'Organizer') {
      return;
    }

    let active = true;

    async function fetchEvents() {
      try {
        const response = await getMyEvents();

        if (active) {
          setEvents(response.data?.events || []);
          setError('');
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              'Could not load your events.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchEvents();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || user?.role !== 'Organizer') return;

    let active = true;

    async function fetchDecisionNotifications() {
      try {
        const response = await getNotifications();
        if (active) {
          setDecisionNotifications(
            (response.data?.notifications || []).filter(
              (notification) => notification.type === 'APPROVAL_DECISION',
            ),
          );
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.message ||
              'Could not load event decision notifications.',
          );
        }
      }
    }

    fetchDecisionNotifications();

    return () => {
      active = false;
    };
  }, [authLoading, user]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function resetForm() {
    setFieldErrors({});
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event, isDraft = false) {
    event.preventDefault();

    if (busy) return;

    setMessage('');
    const errors = {};
    if (!isDraft) {
      for (const [name, label] of fields) {
        if (!String(form[name]).trim()) errors[name] = `Enter ${label.toLowerCase()}.`;
      }
      const start = new Date(form.startDateTime);
      const end = new Date(form.endDateTime);
      const deadline = new Date(form.registrationDeadline);
      if (form.startDateTime && (!Number.isFinite(start.getTime()) || start <= new Date())) errors.startDateTime = 'Choose a future start date and time.';
      if (form.endDateTime && (!Number.isFinite(end.getTime()) || end <= start)) errors.endDateTime = 'Choose an end time after the start time.';
      if (form.registrationDeadline && (!Number.isFinite(deadline.getTime()) || deadline <= new Date() || deadline >= start)) errors.registrationDeadline = 'Choose a future registration deadline before the event starts.';
      if (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1) errors.capacity = 'Enter a whole number of seats greater than zero.';
      if (form.bannerUrl && !formRef.current.elements.bannerUrl.validity.valid) errors.bannerUrl = 'Enter a complete image URL, such as https://example.com/banner.jpg.';
    }
    if (isDraft && form.capacity !== '' && (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1)) {
      errors.capacity = 'Enter a whole number of seats greater than zero, or leave it blank for a draft.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Please correct the highlighted fields before submitting.');
      formRef.current.elements[Object.keys(errors)[0]]?.focus();
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');

    const payload = {
      ...form,
      capacity: form.capacity === '' ? undefined : Number(form.capacity),
      status: isDraft ? 'Draft' : 'Pending Approval',
    };

    try {
      let response;
      if (editingId) {
        response = await updateEvent(editingId, payload);
      } else {
        response = await createEvent(payload);
      }

      const savedStatus = response.data?.event?.status;
      const retainedPublishedEvent = isDraft && savedStatus === 'Pending Approval';
      setMessage(retainedPublishedEvent
        ? 'Changes saved. The previously approved version remains published while these changes await approval.'
        : isDraft
          ? 'Draft saved successfully.'
          : 'Event submitted for approval.');

      resetForm();
      await loadEvents();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not save the event.'
      );
    } finally {
      setBusy(false);
    }
  }

  function startEditing(event) {
    setFieldErrors({});
    setEditingId(event._id);
    setForm(toFormData(event));
    setError('');
    setMessage('');

    formRef.current?.elements.title?.focus();
  }

  function getDecisionNotification(eventId) {
    return decisionNotifications.find((notification) => {
      const notificationEventId = typeof notification.event === 'object'
        ? notification.event?._id
        : notification.event;
      return String(notificationEventId) === String(eventId);
    });
  }

  async function handleMarkNotificationAsRead(notification) {
    if (notification.read || markingNotificationId) return;

    setMarkingNotificationId(notification._id);
    setError('');

    try {
      const response = await markNotificationAsRead(notification._id);
      const updatedNotification = response.data?.notification;
      setDecisionNotifications((previous) =>
        previous.map((item) =>
          item._id === notification._id
            ? updatedNotification || { ...item, read: true }
            : item,
        ),
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Could not update the notification.',
      );
    } finally {
      setMarkingNotificationId(null);
    }
  }

  async function handleCancel(id) {
    if (cancellingEventId) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel this event?'
    );

    if (!confirmed) return;

    setCancellingEventId(id);
    setError('');
    setMessage('');

    try {
      await cancelEvent(id);
      setMessage('Event cancelled.');
      await loadEvents();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not cancel the event.'
      );
    } finally {
      setCancellingEventId(null);
    }
  }

  if (authLoading) {
    return (
      <main id="main-content" tabIndex={-1} className="auth-page">
        <section className="auth-card">
          <p>Checking your login...</p>
        </section>
      </main>
    );
  }

  if (authError) {
    return (
      <main id="main-content" tabIndex={-1} className="auth-page">
        <section className="auth-card">
          <p className="auth-eyebrow">
            College Event Management System
          </p>
          <h1>Login required</h1>
          <p role="alert">{authError}</p>
          <Link to="/login">Go to login</Link>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'Organizer') {
    const dashboard = {
      Student: '/student/dashboard',
      Admin: '/admin/dashboard',
    }[user.role];

    return <Navigate to={dashboard || '/login'} replace />;
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-page event-page">
      <section className="auth-card event-card">
        <p className="auth-eyebrow">
          College Event Management System
        </p>

        <h1>Manage your events</h1>
        <p>
          Create events, save drafts, and track approval status.
        </p>
        <p>Welcome, {user.name}.</p>

        <p>
          <Link to="/organizer/dashboard">
            Back to dashboard
          </Link>
        </p>

        {message && <p role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <h2>{editingId ? 'Edit event' : 'Create an event'}</h2>

        <p id="event-form-help">All fields are required to submit for approval. You can save an incomplete draft.</p>
        <form ref={formRef} noValidate aria-describedby="event-form-help" aria-busy={busy} onSubmit={(event) => handleSubmit(event, false)}>
          {fields.map(([name, label, type]) => (
            <div className="event-field" key={name}>
              <label htmlFor={name}>{label}</label>

              {type === 'textarea' ? (
                <textarea
                  id={name}
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  rows={4}
                  required
                  aria-invalid={Boolean(fieldErrors[name])}
                  aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
                />
              ) : (
                <input
                  id={name}
                  name={name}
                  type={type}
                  min={type === 'number' ? 1 : undefined}
                  value={form[name]}
                  onChange={handleChange}
                  required
                  aria-invalid={Boolean(fieldErrors[name])}
                  aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
                />
              )}
              {fieldErrors[name] && <p className="field-error" id={`${name}-error`}>{fieldErrors[name]}</p>}
            </div>
          ))}

          <div className="event-actions">
            <button
              className="auth-button"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Saving...' : 'Submit for approval'}
            </button>

            <button
              className="auth-button secondary-button"
              type="button"
              disabled={busy}
              onClick={(event) => handleSubmit(event, true)}
            >
              {busy ? 'Saving...' : 'Save draft'}
            </button>

            {editingId && (
              <button
                className="auth-button secondary-button"
                type="button"
                disabled={busy}
                onClick={resetForm}
              >
                Stop editing
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="auth-card event-card">
        <h2>Your events</h2>

        {loading && <p role="status">Loading events...</p>}

        {!loading && !error && events.length === 0 && (
          <p>You have not created any events yet.</p>
        )}

        {events.map((event) => {
          const decisionNotification = getDecisionNotification(event._id);

          return (
            <article className="event-list-item" key={event._id}>
              <h3>{event.title || 'Untitled draft'}</h3>

              <p>
                Status: <strong>{event.status}</strong>
              </p>
              {event.status === 'Pending Approval' && (
                <p>Your event is awaiting administrator review and cannot be edited until a decision is made.</p>
              )}
              {(event.status === 'Rejected' || event.status === 'Changes Requested') && (
                <p>You can edit this event and submit it again for review.</p>
              )}
              {event.approvedSnapshot && event.status !== 'Approved' && (
                <p>The last approved version remains public while these changes are not approved.</p>
              )}
              {decisionNotification && (
                <div className="event-decision-notice" role="status">
                  <p>
                    <strong>{decisionNotification.title}:</strong>{' '}
                    {decisionNotification.message}
                  </p>
                  <p>{decisionNotification.read ? 'Read' : 'Unread'}</p>
                  {!decisionNotification.read && (
                    <button
                      className="auth-button secondary-button"
                      type="button"
                      disabled={markingNotificationId === decisionNotification._id}
                      onClick={() => handleMarkNotificationAsRead(decisionNotification)}
                    >
                      {markingNotificationId === decisionNotification._id
                        ? 'Saving...'
                        : 'Mark as read'}
                    </button>
                  )}
                </div>
              )}

              {event.venue && <p>Venue: {event.venue}</p>}
              {event.status === 'Approved' && (
                <p><Link className="event-link" to={`/organizer/events/${event._id}/attendance`}>Take attendance</Link></p>
              )}

              {event.startDateTime && (
                <p>
                  Starts:{' '}
                  {new Date(
                    event.startDateTime
                  ).toLocaleString()}
                </p>
              )}

              {event.status !== 'Cancelled' && (
                <div className="event-actions">
                  {event.status !== 'Pending Approval' && (
                    <button
                      className="auth-button"
                      type="button"
                      onClick={() => startEditing(event)}
                    >
                      Edit
                    </button>
                  )}

                  <button
                    className="auth-button secondary-button"
                    type="button"
                    disabled={cancellingEventId === event._id}
                    onClick={() => handleCancel(event._id)}
                  >
                    {cancellingEventId === event._id ? 'Cancelling...' : 'Cancel event'}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </section>
    </main>
  );
}

export default OrganizerEvents;
