
const mongoose = require('mongoose');

const eventDetailsSchema = new mongoose.Schema(
  {
    title: String,
    category: String,
    description: String,
    venue: String,
    department: String,
    startDateTime: Date,
    endDateTime: Date,
    capacity: Number,
    bannerUrl: String,
    registrationDeadline: Date,
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: function () { return this.status !== 'Draft'; },
    },
    category: {
      type: String,
      trim: true,
      required: function () { return this.status !== 'Draft'; },
    },
    description: {
      type: String,
      trim: true,
      required: function () { return this.status !== 'Draft'; },
    },
    venue: {
      type: String,
      trim: true,
      required: function () { return this.status !== 'Draft'; },
    },
    department: {
      type: String,
      trim: true,
      required: function () { return this.status !== 'Draft'; },
    },
    startDateTime: {
      type: Date,
      required: function () { return this.status !== 'Draft'; },
    },
    endDateTime: {
      type: Date,
      required: function () { return this.status !== 'Draft'; },
    },
    capacity: {
      type: Number,
      min: 1,
      required: function () { return this.status !== 'Draft'; },
    },
    bannerUrl: {
      type: String,
      trim: true,
      required: function () { return this.status !== 'Draft'; },
    },
    registrationDeadline: {
      type: Date,
      required: function () { return this.status !== 'Draft'; },
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'Draft',
        'Pending Approval',
        'Approved',
        'Rejected',
        'Changes Requested',
        'Cancelled',
      ],
      default: 'Draft',
      index: true,
    },
    approvedSnapshot: {
      type: eventDetailsSchema,
      default: undefined,
    },
    registeredStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  { timestamps: true }
);

eventSchema.index({ venue: 1, startDateTime: 1, endDateTime: 1, status: 1 });

module.exports = mongoose.model('Event', eventSchema);
