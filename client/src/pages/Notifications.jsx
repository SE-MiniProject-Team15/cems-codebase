import { useCallback, useEffect, useState } from 'react';
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
    registrationDeadline: toLocalDateTime(event.registrationDeadline),
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

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await getMyEvents();
      setEvents(response.data?.events || []);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load your events.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
        if (active) setAuthLoading(false);
      }
    }

    checkAuthentication();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
  if (authLoading || user?.role !== 'Organizer'){ return};

  let active = true;

  async function fetchEvents() {
    setError('');
    setLoading(true);

    try {
      const response = await getMyEvents();

      if (active) {
        setEvents(response.data?.events || []);
      }
    } catch (err) {
      if (active) {
        setError(
          err.response?.data?.message || 'Could not load your events.'
        );
      }
    } finally {
      if (active) setLoading(false);
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
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event, isDraft = false) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    const payload = {
      ...form,
      capacity: Number(form.capacity),
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
        err.response?.data?.message || 'Could not save the event.'
      );
    } finally {
      setBusy(false);
    }
  }

  function startEditing(event) {
    setEditingId(event._id);
    setForm(toFormData(event));
    setError('');
    setMessage('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
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
        err.response?.data?.message || 'Could not cancel the event.'
      );
    }
  }

  if (authLoading) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p>Checking your login...</p>
        </section>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="auth-page">
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
    <main className="auth-page event-page">
      <section className="auth-card event-card">
        <p className="auth-eyebrow">
          College Event Management System
        </p>

        <h1>Manage your events</h1>
        <p>Create events, save drafts, and track approval status.</p>
        <p>Welcome, {user.name}.</p>

        <p>
          <Link to="/organizer/dashboard">Back to dashboard</Link>
        </p>

        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}

        <h2>{editingId ? 'Edit event' : 'Create an event'}</h2>

        <form onSubmit={(event) => handleSubmit(event, false)}>
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
                />
              ) : (
                <input
                  id={name}
                  name={name}
                  type={type}
                  min={type === 'number' ? 1 : undefined}
                  value={form[name]}
                  onChange={handleChange}
                  required={
                    ![
                      'description',
                      'bannerUrl',
                      'registrationDeadline',
                    ].includes(name)
                  }
                />
              )}
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

        {loading && <p>Loading events...</p>}

        {!loading && events.length === 0 && (
          <p>You have not created any events yet.</p>
        )}

        {events.map((event) => (
          <article className="event-list-item" key={event._id}>
            <h3>{event.title || 'Untitled draft'}</h3>
            <p>
              Status: <strong>{event.status}</strong>
            </p>

            {event.venue && <p>Venue: {event.venue}</p>}

            {event.startDateTime && (
              <p>
                Starts: {new Date(event.startDateTime).toLocaleString()}
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