
const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../models/Event');
const { updateEvent } = require('../controllers/eventController');

test('updating an incomplete draft keeps it as Draft', async (t) => {
  const originalFindOne = Event.findOne;
  const originalExists = Event.exists;

  const eventId = '507f1f77bcf86cd799439011';
  const organizerId = '507f191e810c19729de860ea';

  const draft = {
    _id: eventId,
    organizer: organizerId,
    status: 'Draft',
    title: 'My incomplete draft',
    venue: '',
    registeredStudents: [],
    approvedSnapshot: null,
    toObject() {
      return {
        _id: this._id,
        organizer: this.organizer,
        status: this.status,
        title: this.title,
        venue: this.venue,
        registeredStudents: this.registeredStudents,
        approvedSnapshot: this.approvedSnapshot,
      };
    },
    async save() {
      this.saved = true;
    },
  };

  t.after(() => {
    Event.findOne = originalFindOne;
    Event.exists = originalExists;
  });

  Event.findOne = () => Promise.resolve(draft);
  Event.exists = () => Promise.resolve(false);

  const req = {
    params: { id: eventId },
    user: { _id: organizerId },
    body: { title: 'Updated draft title' },
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  let nextError;
  await updateEvent(req, res, (error) => {
    nextError = error;
  });

  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'success');
  assert.equal(draft.status, 'Draft');
  assert.equal(draft.title, 'Updated draft title');
  assert.equal(draft.saved, true);
});
