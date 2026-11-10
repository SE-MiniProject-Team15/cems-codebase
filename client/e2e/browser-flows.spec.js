import { test, expect } from '@playwright/test'

const event = {
  id: '507f1f77bcf86cd799439011', _id: '507f1f77bcf86cd799439011',
  title: 'Campus workshop', description: 'Learn together', category: 'Workshop',
  department: 'Computing', venue: 'Main hall', capacity: 50, remainingSeats: 20,
  startDateTime: '2099-06-10T10:00:00Z', endDateTime: '2099-06-10T12:00:00Z',
  registrationDeadline: '2099-06-09T10:00:00Z', status: 'Approved',
}

async function fixture(page, role = 'Student', guest = false) {
  let signedIn = !guest
  let registrations = []
  const writes = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    let status = 200
    let data
    let message = 'Saved successfully.'
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    } })
    if (method !== 'GET') writes.push({ path, method, body: request.postDataJSON() })
    if (path === '/api/auth/register' || path === '/api/auth/login') signedIn = true
    if (path.startsWith('/api/auth/')) {
      status = signedIn ? 200 : 401
      data = { user: signedIn ? { _id: 'user-1', name: 'Campus User', role } : null }
    } else if (path === '/api/events' && method === 'GET') {
      data = { events: [event], pagination: { page: 1, totalPages: 1, total: 1 } }
    } else if (path === '/api/events/mine') data = { events: [] }
    else if (path === '/api/events' && method === 'POST') data = { event: { ...event, ...request.postDataJSON() } }
    else if (path === `/api/events/${event.id}`) data = { event }
    else if (path === `/api/events/${event.id}/register`) {
      if (method === 'POST') {
        registrations = [{ id: 'registration-1', event, status: 'Registered',
          registrationCode: 'ticket-123', qrPayload: 'ticket-123' }]
        data = { registration: registrations[0], notificationSaved: true }
        message = 'Registration confirmed.'
      } else {
        registrations = []
        data = { promotionNotificationSaved: true }
        message = 'Registration cancelled.'
      }
    } else if (path === '/api/registrations/me') data = { registrations }
    else throw new Error(`Unexpected API request: ${method} ${path}`)
    await route.fulfill({ status, contentType: 'application/json', headers: {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Credentials': 'true',
    }, body: JSON.stringify({ status: status === 200 ? 'success' : 'fail', data, message }) })
  })
  return writes
}

test('account creation submits fields and opens the student dashboard', async ({ page }) => {
  const writes = await fixture(page, 'Student', true)
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Campus User')
  await page.getByLabel('College Email').fill('student@example.edu')
  await page.getByLabel('Password', { exact: true }).fill('Example123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Student Dashboard' })).toBeVisible()
  expect(writes[0].body).toEqual({ name: 'Campus User', email: 'student@example.edu', password: 'Example123', role: 'Student' })
})

test('login submits credentials and opens the organizer dashboard', async ({ page }) => {
  const writes = await fixture(page, 'Organizer', true)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('organizer@example.edu')
  await page.getByLabel('Password', { exact: true }).fill('Example123')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Organizer Dashboard' })).toBeVisible()
  expect(writes[0].body.email).toBe('organizer@example.edu')
})

test('browse, filter, register, render a QR ticket and cancel', async ({ page }) => {
  await fixture(page)
  await page.goto('/events')
  await page.getByLabel('Search', { exact: true }).fill('Campus')
  await page.getByLabel('From', { exact: true }).fill('2099-06-01')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/q=Campus.*dateFrom=2099-06-01/)
  await page.getByRole('link', { name: 'View details for Campus workshop' }).click()
  await page.getByRole('button', { name: 'Register for event' }).click()
  await expect(page.getByRole('status')).toHaveText('Registration confirmed.')
  await page.getByRole('link', { name: 'View all registrations and tickets' }).click()
  await expect(page.getByRole('img', { name: 'Entry QR code for Campus workshop' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel registration' }).click()
  await expect(page.getByRole('heading', { name: 'No upcoming registrations' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Registration cancelled.')
})

test('organizer submits a complete event using native date and number fields', async ({ page }) => {
  const writes = await fixture(page, 'Organizer')
  await page.goto('/organizer/events')
  for (const [label, value] of Object.entries({
    'Event title': 'Campus workshop', Description: 'Learn together', Venue: 'Main hall',
    Department: 'Computing', 'Start date and time': '2099-06-10T10:00',
    'End date and time': '2099-06-10T12:00', 'Registration deadline': '2099-06-09T10:00',
    'Maximum capacity': '50', 'Banner image URL': 'https://example.edu/banner.png',
  })) await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'submitted' })).toBeVisible()
  expect(writes[0].body).toMatchObject({ title: 'Campus workshop', capacity: 50, status: 'Pending Approval' })
})
