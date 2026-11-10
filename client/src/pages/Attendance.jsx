import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import useAuth from '../context/useAuth';
import {
  checkInRegistration,
  getAttendanceOverview,
  getEventAttendance,
} from '../services/api';

const dateTime = (value) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

function CheckInScanner({ onCode }) {
  const videoRef = useRef(null);
  const onCodeRef = useRef(onCode);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let stream;
    let timer;
    const videoElement = videoRef.current;

    if (!videoElement) return undefined;

    async function startScanner() {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoElement.srcObject = stream;
        await videoElement.play();

        async function scan() {
          if (stopped) return;
          try {
            const codes = await detector.detect(videoElement);
            if (codes[0]?.rawValue) {
              setActive(false);
              onCodeRef.current(codes[0].rawValue);
              return;
            }
          } catch {
            setError('Could not read a QR code. Keep it centered or enter the code manually.');
          }
          timer = window.setTimeout(scan, 250);
        }

        scan();
      } catch (err) {
        setError(err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Enter the code manually.'
          : 'Could not start the camera. Enter the code manually.');
        setActive(false);
      }
    }

    startScanner();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      videoElement.srcObject = null;
    };
  }, [active]);

  return <div className="scanner-panel">
    <button className="auth-button secondary-button" type="button" onClick={() => {
      if (active) {
        setActive(false);
        return;
      }
      if (!('BarcodeDetector' in window)) {
        setError('QR scanning is not available in this browser. Enter the code manually.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available. Enter the code manually.');
        return;
      }
      setError('');
      setActive(true);
    }}>
      {active ? 'Stop camera' : 'Scan QR code'}
    </button>
    {active && <video className="attendance-camera" ref={videoRef} muted playsInline aria-label="Camera QR scanner" />}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </div>;
}

function AttendanceTable({ registrations }) {
  if (!registrations.length) return <p>No students have registered yet.</p>;
  return <div className="attendance-table-wrap">
    <table className="attendance-table">
      <thead><tr><th scope="col">Student</th><th scope="col">Email</th><th scope="col">Registered</th><th scope="col">Attendance</th></tr></thead>
      <tbody>{registrations.map((item) => <tr key={item.studentId}>
        <td>{item.name}</td><td>{item.email}</td>
        <td>{dateTime(item.registeredAt)}</td>
        <td>{item.attendedAt ? `Checked in ${dateTime(item.attendedAt)}${item.checkedInBy ? ` by ${item.checkedInBy}` : ''}` : 'Not checked in'}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function OrganizerAttendance() {
  const { eventId } = useParams();
  const { user, loading } = useAuth();
  const [attendance, setAttendance] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshAttendance = useCallback(async () => {
    try {
      const response = await getEventAttendance(eventId);
      setAttendance(response.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load attendance.');
    }
  }, [eventId]);

  useEffect(() => {
    if (loading || user?.role !== 'Organizer') return undefined;
    let active = true;
    async function load() {
      try {
        const response = await getEventAttendance(eventId);
        if (active) {
          setAttendance(response.data);
          setLoadError('');
        }
      } catch (err) {
        if (active) setLoadError(err.response?.data?.message || 'Could not load attendance.');
      }
    }
    load();
    const interval = window.setInterval(load, 8000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [eventId, loading, user]);

  const checkIn = useCallback(async (value) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await checkInRegistration(eventId, value);
      setMessage(`Attendance recorded at ${dateTime(response.data.attendedAt)}.`);
      setCode('');
      await refreshAttendance();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not record attendance.');
    } finally {
      setBusy(false);
    }
  }, [busy, eventId, refreshAttendance]);

  if (loading) return <main className="events-page"><p className="events-status">Loading account...</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'Organizer') return <Navigate to="/login" replace />;

  return <main className="events-page">
    <header className="events-header"><Link className="events-brand" to="/organizer/events">CEMS</Link><Link to="/organizer/events">Your events</Link></header>
    <section className="events-content attendance-content">
      <Link className="event-link" to="/organizer/events">← Back to events</Link>
      {loadError && <p className="auth-error" role="alert">{loadError}</p>}
      {attendance && <>
        <div className="events-heading"><div><p className="auth-eyebrow">Organizer attendance</p><h1>{attendance.event.title}</h1><p>{dateTime(attendance.event.startDateTime)} – {dateTime(attendance.event.endDateTime)}</p></div></div>
        <div className="attendance-summary"><strong>{attendance.event.attendedCount}</strong> checked in of <strong>{attendance.event.registeredCount}</strong> registered</div>
        <section className="attendance-panel">
          <h2>Check in a student</h2>
          <p>Check-in is accepted only during the event. Scanned and entered codes are single-use.</p>
          <CheckInScanner onCode={checkIn} />
          <form className="attendance-code-form" onSubmit={(event) => { event.preventDefault(); checkIn(code); }}>
            <label htmlFor="attendance-code">Registration code</label>
            <input id="attendance-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" maxLength={160} placeholder="Paste or scan the ticket QR code" />
            <button className="auth-button" type="submit" disabled={busy || !code}>{busy ? 'Checking in...' : 'Record attendance'}</button>
          </form>
          {message && <p role="status">{message}</p>}
        </section>
        <section className="attendance-panel"><h2>Registration and attendance</h2><p>This list refreshes automatically every 8 seconds.</p><AttendanceTable registrations={attendance.registrations} /></section>
      </>}
    </section>
  </main>;
}

function AdminAttendance() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [attendance, setAttendance] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || user?.role !== 'Admin') return undefined;
    let active = true;
    async function load() {
      try {
        const response = await getAttendanceOverview();
        if (active) {
          setEvents(response.data.events);
          setError('');
        }
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Could not load attendance overview.');
      }
    }
    load();
    const interval = window.setInterval(load, 8000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loading, user]);

  useEffect(() => {
    if (!selectedId) return undefined;
    let active = true;
    async function load() {
      try {
        const response = await getEventAttendance(selectedId);
        if (active) setAttendance(response.data);
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Could not load attendance.');
      }
    }
    load();
    const interval = window.setInterval(load, 8000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedId]);

  if (loading) return <main className="events-page"><p className="events-status">Loading account...</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'Admin') return <Navigate to="/login" replace />;

  return <main className="events-page">
    <header className="events-header"><Link className="events-brand" to="/admin/dashboard">CEMS</Link><Link to="/admin/dashboard">Dashboard</Link></header>
    <section className="events-content attendance-content">
      <div className="events-heading"><div><p className="auth-eyebrow">Administrator attendance</p><h1>Event attendance</h1><p>Attendance updates automatically every 8 seconds.</p></div></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {events.length === 0 ? <p className="events-empty">No event registrations yet.</p> : <label className="attendance-event-select">Event
          <select value={selectedId} onChange={(event) => {
            setAttendance(null);
            setSelectedId(event.target.value);
          }}>
          <option value="">Choose an event</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title} — {event.attendedCount}/{event.registeredCount} checked in</option>)}
        </select>
      </label>}
      {attendance && <section className="attendance-panel"><h2>{attendance.event.title}</h2><p>{dateTime(attendance.event.startDateTime)} – {dateTime(attendance.event.endDateTime)}</p><div className="attendance-summary"><strong>{attendance.event.attendedCount}</strong> checked in of <strong>{attendance.event.registeredCount}</strong> registered</div><AttendanceTable registrations={attendance.registrations} /></section>}
    </section>
  </main>;
}

export { AdminAttendance, OrganizerAttendance };
