// Start PR #7's client on port 4174 first. Uses the NFR-03 client's test tools.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../client/package.json', import.meta.url))
const { chromium } = require('playwright')
const origin = process.argv[2] || 'http://127.0.0.1:4174'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
})
try {
  const page = await browser.newPage()
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let data = {}
    if (pathname === '/api/auth/me') data = { user: { _id: 'student-id', name: 'Student', role: 'Student' } }
    if (pathname === '/api/registrations/me') data = { registrations: [{
      id: 'registration-id', status: 'Registered', attendanceStatus: 'Present',
      event: { id: '507f1f77bcf86cd799439011', title: 'Completed workshop', category: 'Workshop',
        startDateTime: '2026-01-01T10:00:00Z', endDateTime: '2026-01-01T12:00:00Z', venue: 'Main Hall' },
    }] }
    const missingFeedback = pathname.endsWith('/feedback')
    await route.fulfill({ status: missingFeedback ? 404 : 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' },
      body: JSON.stringify({ status: missingFeedback ? 'fail' : 'success', data }),
    })
  })
  await page.goto(`${origin}/registrations`)
  await page.getByRole('button', { name: 'Leave Feedback' }).click()
  await page.getByRole('dialog').waitFor()
  const focusInsideDialog = await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))
  assert.equal(focusInsideDialog, false)
  await page.keyboard.press('Escape')
  const remainsAfterEscape = await page.getByRole('dialog').isVisible()
  assert.equal(remainsAfterEscape, true)
  let tabEscapesDialog = false
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab')
    if (await page.evaluate(() => !document.activeElement.closest('[role="dialog"]'))) {
      tabEscapesDialog = true
      break
    }
  }
  assert.equal(tabEscapesDialog, true)
  console.log(JSON.stringify({ focusInsideDialog, remainsAfterEscape, tabEscapesDialog }, null, 2))
} finally {
  await browser.close()
}
