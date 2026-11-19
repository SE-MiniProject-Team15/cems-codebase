const mongoose = require('mongoose');

const eventAuditLogSchema = new mongoose.Schema(
  {
    administrator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      immutable: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      immutable: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'CHECK_IN'],
      required: true,
      immutable: true,
    },
    targetType: {
      type: String,
      enum: ['Event', 'Registration'],
      required: true,
      immutable: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    comment: {
      type: String,
      trim: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
    strict: 'throw',
  }
);

eventAuditLogSchema.index({ event: 1, createdAt: -1 });
eventAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

eventAuditLogSchema.pre('save', function preventAuditOverwrite() {
  if (!this.isNew) {
    throw new Error('Event audit records are append-only');
  }
});

eventAuditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  function preventAuditMutation() {
    throw new Error('Event audit records are append-only');
  }
);

module.exports = mongoose.model('EventAuditLog', eventAuditLogSchema);
