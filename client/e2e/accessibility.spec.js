import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const campusEvent = {
  id: '507f1f77bcf86cd799439011',
  _id: '507f1f77bcf86cd799439011',
  title: 'Campus workshop with a long title for a small screen',
  description: 'An introductory workshop for the campus community.',
  category: 'Workshop',
  department: 'Computer Science and Engineering',
  venue: 'Main auditorium, second floor, engineering building',
  startDateTime: '2099-06-10T10:00:00Z',
  endDateTime: '2099-06-10T12:00:00Z',
  registrationDeadline: '2099-06-09T10:00:00Z',
  capacity: 50,
  remainingSeats: 20,
  status: 'Draft',
}

async function mockApi(page, role = 'Student', options = {}) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let data = {}
    if (path === '/api/auth/me') data = { user: { _id: 'student-id', name: 'Campus User', role } }
    if (path === '/api/events') data = { events: [campusEvent], pagination: { total: 1, totalPages: 1, page: 1 } }
    if (path === '/api/events/mine' || path === '/api/events/public') data = { events: [campusEvent] }
    if (path === `/api/events/${campusEvent.id}`) data = { event: campusEvent }
    if (path === '/api/registrations/me') data = { registrations: [{ id: 'reg-1', event: campusEvent, status: 'Registered', registrationCode: 'example-ticket-code', qrPayload: 'example-ticket-code' }] }
    if (path === '/api/notifications') data = { notifications: [{
      _id: 'notice-1', title: 'Event update', message: 'The workshop venue has changed.', read: false,
      createdAt: '2026-10-30T10:00:00Z',
    }] }
    if (path === '/api/notifications/notice-1/read') data = { notification: {
      _id: 'notice-1', title: 'Event update', message: 'The workshop venue has changed.', read: true,
    } }
    const unauthorized = options.guest && path === '/api/auth/me'
    await route.fulfill({ status: unauthorized ? 401 : 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173', 'Access-Control-Allow-Credentials': 'true' },
      body: JSON.stringify({ status: unauthorized ? 'fail' : 'success', data }),
    })
  })
}

async function checkAccessibility(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
}

const pages = [
  ['/login', 'Student', 'Welcome back'],
  ['/register', 'Student', 'Create your account'],
  ['/student/dashboard', 'Student', 'Student Dashboard'],
  ['/organizer/dashboard', 'Organizer', 'Organizer Dashboard'],
  ['/admin/dashboard', 'Admin', 'Admin Dashboard'],
  ['/events', 'Student', 'Find your next campus event'],
  [`/events/${campusEvent.id}`, 'Student', campusEvent.title],
  ['/organizer/events', 'Organizer', 'Manage your events'],
  ['/registrations', 'Student', 'My registrations & tickets'],
  ['/notifications', 'Student', 'Notifications'],
  ['/student/events', 'Student', 'Explore Events'],
]

for (const width of [320, 768, 1440]) {
  for (const colorScheme of ['light', 'dark']) {
    for (const [path, role, heading] of pages) {
      test(`${path} at ${width}px in ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme })
        await mockApi(page, role)
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
        await expect(page.getByText(/Loading events|Loading event\.\.\.|Loading notifications/)).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await checkAccessibility(page)
        if (width === 320 && colorScheme === 'light' && path === '/organizer/events') {
          await page.screenshot({ path: test.info().outputPath('organizer-mobile.png'), fullPage: true })
        }
      })
    }
  }
}

test('skip link and route changes move keyboard focus into the main landmark', async ({ page }) => {
  await mockApi(page, 'Student', { guest: true })
  await page.goto('/login')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  if (test.info().project.name === 'webkit') {
    // WebKit's Playwright port follows the host's link-tabbing preference.
    // Focus directly here; Chromium and Firefox cover sequential Tab navigation.
    await skipLink.focus()
  } else {
    await page.keyboard.press('Tab')
  }
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveTitle('Create an account | CEMS')
  await expect(page.getByRole('main')).toBeFocused()
})

test('organizer errors identify fields, focus the first error, and allow an incomplete draft', async ({ page }) => {
  await mockApi(page, 'Organizer')
  await page.goto('/organizer/events')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByLabel('Event title')).toBeFocused()
  await expect(page.getByLabel('Event title')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('Please correct')
  await checkAccessibility(page)
  await page.getByLabel('Maximum capacity').fill('')
  const draftRequest = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/events')
  await page.getByRole('button', { name: 'Save draft' }).click()
  const draftPayload = (await draftRequest).postDataJSON()
  expect(draftPayload.status).toBe('Draft')
  expect(draftPayload).not.toHaveProperty('capacity')
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved successfully.' })).toBeVisible()
})

test('password guidance is associated with the field and invalid passwords retain input', async ({ page }) => {
  await mockApi(page, 'Student', { guest: true })
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('New Student')
  await page.getByLabel('College Email').fill('student@example.edu')
  await page.getByLabel('Password', { exact: true }).fill('abcdefgh')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('at least one letter and one digit')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('abcdefgh')
  await checkAccessibility(page)
})

test('notification history has a usable mark-as-read action', async ({ page }) => {
  await mockApi(page)
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Mark as read' }).click()
  await expect(page.getByText('Read', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark as read' })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Notification marked as read.')
})

test('organizer validates dates and capacity while retaining entered values', async ({ page }) => {
  await mockApi(page, 'Organizer')
  await page.goto('/organizer/events')
  await page.getByLabel('Event title').fill('Student workshop')
  await page.getByLabel('Start date and time').fill('2099-06-10T10:00')
  await page.getByLabel('End date and time').fill('2099-06-10T09:00')
  await page.getByLabel('Registration deadline').fill('2099-06-11T10:00')
  await page.getByLabel('Maximum capacity').fill('0')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText('Choose an end time after the start time.')).toBeVisible()
  await expect(page.getByText('Choose a future registration deadline before the event starts.')).toBeVisible()
  await expect(page.getByLabel('Maximum capacity')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Event title')).toHaveValue('Student workshop')
})

test('notification errors explain the failure without showing a false empty state', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/notifications', (route) => route.fulfill({ status: 503, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173', 'Access-Control-Allow-Credentials': 'true' },
    body: JSON.stringify({ message: 'Notifications are temporarily unavailable. Please try again.' }),
  }))
  await page.goto('/notifications')
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByText('No notifications yet.')).toHaveCount(0)
  await checkAccessibility(page)
})

test('reduced motion removes hover movement and expanded text spacing still reflows', async ({ page }) => {
  await mockApi(page, 'Student', { guest: true })
  await page.setViewportSize({ width: 320, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/register')
  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' })
  const button = page.getByRole('button', { name: 'Create account' })
  await button.hover()
  expect(await button.evaluate((element) => getComputedStyle(element).transform)).toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await checkAccessibility(page)
})
