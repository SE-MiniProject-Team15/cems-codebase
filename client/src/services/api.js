import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

function getPayload(response) {
  return response.data;
}

export function registerUser(data) {
  return api.post('/auth/register', data).then(getPayload);
}

export function loginUser(data) {
  return api.post('/auth/login', data).then(getPayload);
}

export function logoutUser() {
  return api.post('/auth/logout').then(getPayload);
}

export function getCurrentUser() {
  return api.get('/auth/me').then(getPayload);
}

export function createEvent(data) {
  return api.post('/events', data).then(getPayload);
}

export function getMyEvents() {
  return api.get('/events/mine').then(getPayload);
}

export function updateEvent(id, data) {
  return api.patch(`/events/${id}`, data).then(getPayload);
}

export function cancelEvent(id) {
  return api.patch(`/events/${id}/cancel`).then(getPayload);
}

export function getPublicEvents() {
  return api.get('/events/public').then(getPayload);
}

export function approveEvent(id) {
  return api.patch(`/events/${id}/approve`).then(getPayload);
}

export function getEvents(params) {
  return api.get('/events', { params }).then(getPayload);
}

export function getEvent(eventId) {
  return api.get(`/events/${encodeURIComponent(eventId)}`).then(getPayload);
}

export function registerForEvent(eventId) {
  return api.post(`/events/${encodeURIComponent(eventId)}/register`).then(getPayload);
}

export function cancelRegistration(eventId) {
  return api.delete(`/events/${encodeURIComponent(eventId)}/register`).then(getPayload);
}

export function getMyRegistrations(options = {}) {
  return api.get('/registrations/me', { params: options }).then(getPayload);
}

export function submitFeedback(eventId, data) {
  return api.post(`/events/${encodeURIComponent(eventId)}/feedback`, data).then(getPayload);
}

export function getStudentFeedback(eventId) {
  return api.get(`/events/${encodeURIComponent(eventId)}/feedback`).then(getPayload);
}

export function getEventFeedbackSummary(eventId) {
  return api.get(`/events/${encodeURIComponent(eventId)}/feedback`).then(getPayload);
}

export function getNotifications() {
  return api.get('/notifications').then(getPayload);
}

export function markNotificationAsRead(id) {
  return api.patch(`/notifications/${id}/read`).then(getPayload);
}

export default api;
