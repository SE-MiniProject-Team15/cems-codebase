
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'EVENT_CANCELLED',
        'EVENT_UPDATED',
        'EVENT_REMINDER',
        'REGISTRATION_CONFIRMATION',
        'WAITLIST_JOINED',
        'APPROVAL_DECISION',
        'WAITLIST_PROMOTED',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    scheduledFor: Date,
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index(
  { recipient: 1, event: 1, type: 1, scheduledFor: 1 },
  { unique: true, partialFilterExpression: { type: 'EVENT_REMINDER', scheduledFor: { $exists: true } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
