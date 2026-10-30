const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      select: false,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number from 1 to 5',
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, 'Comment must be 1000 characters or fewer'],
      default: '',
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ event: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
