const mongoose = require('mongoose')
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  venue: { type: String, required: true, trim: true, maxlength: 160 },
  department: { type: String, required: true, trim: true, maxlength: 120 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  registrationDeadline: { type: Date, required: true },
  capacity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  registrationCount: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  bannerUrl: { type: String, trim: true, maxlength: 2048 },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'changes_requested', 'cancelled'],
    default: 'pending',
    index: true,
  },
}, { timestamps: true })
eventSchema.index({ status: 1, startAt: 1 })
eventSchema.index({ status: 1, category: 1, startAt: 1 })
eventSchema.index({ title: 'text', description: 'text' })
module.exports = mongoose.model('Event', eventSchema)
