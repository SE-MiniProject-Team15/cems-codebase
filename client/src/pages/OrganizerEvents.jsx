
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  createEvent,
  getMyEvents,
  updateEvent,
  cancelEvent,
  getCurrentUser,
} from '../services/api';

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
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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

  // Verify the current login.
  useEffect(() => {
    let active = true;

    async function checkAuthentication() {
      try {
        const response = await getCurrentUser();

        if (!active) return;

        const currentUser = response.data?.user;

        if (!currentUser) {
          setAuthError(
            'Your session could not be verified. Please log in again.'
          );
          return;
        }

        setUser(currentUser);
      } catch (err) {
        if (!active) return;

        if (err.response?.status === 401) {
          setAuthError(
            'Your session has expired. Please log in again.'
          );
        } else {
          setAuthError(
            err.response?.data?.message ||
              'Could not verify your login. Check that the backend is running.'
          );
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    checkAuthentication();

    return () => {
      active = false;
    };
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
      if (editingId) {
        await updateEvent(editingId, payload);
      } else {
        await createEvent(payload);
      }

      setMessage(
        isDraft
          ? 'Draft saved successfully.'
          : 'Event submitted for approval.'
      );

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

  async function handleCancel(id) {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this event?'
    );

    if (!confirmed) return;

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

        {events.map((event) => (
          <article
            className="event-list-item"
            key={event._id}
          >
            <h3>{event.title || 'Untitled draft'}</h3>

            <p>
              Status: <strong>{event.status}</strong>
            </p>

            {event.venue && <p>Venue: {event.venue}</p>}

            {event.startDateTime && (
              <p>
                Starts:{' '}
                {new Date(
                  event.startDateTime
                ).toLocaleString()}
              </p>
            )}

            {event.status === 'Approved' && (
              <p>
                <Link className="event-link" to={`/organizer/events/${event._id}/attendance`}>
                  Take attendance
                </Link>
              </p>
            )}

            {event.status !== 'Cancelled' && (
              <div className="event-actions">
                <button
                  className="auth-button"
                  type="button"
                  onClick={() => startEditing(event)}
                >
                  Edit
                </button>

                <button
                  className="auth-button secondary-button"
                  type="button"
                  onClick={() => handleCancel(event._id)}
                >
                  Cancel event
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

export default OrganizerEvents;
