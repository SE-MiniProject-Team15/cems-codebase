import axios from 'axios'
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
})
function getPayload(response) {
  return response.data
}
export function registerUser(data) {
  return api.post('/auth/register', data).then(getPayload)
}
export function loginUser(data) {
  return api.post('/auth/login', data).then(getPayload)
}
export function logoutUser() {
  return api.post('/auth/logout').then(getPayload)
}
export function getCurrentUser() {
  return api.get('/auth/me').then(getPayload)
}
export function getEvents(params) {
  return api.get('/events', { params }).then(getPayload)
}
export function getEvent(eventId) {
  return api.get('/events/' + encodeURIComponent(eventId)).then(getPayload)
}
export default api
