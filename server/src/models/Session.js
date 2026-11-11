import mongoose from 'mongoose';

/**
 * Session Schema
 * Represents a completed posture tracking session.
 * Privacy constraint: Only numeric metrics and timestamps are saved; no camera or image data.
 */
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    endedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    durationSec: {
      type: Number,
      required: true,
      min: 0
    },
    goodSec: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    badSec: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    alertsCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    avgScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    timelineScores: {
      type: [Number],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast queries of a user's recent sessions
sessionSchema.index({ userId: 1, endedAt: -1 });

export const Session = mongoose.model('Session', sessionSchema);
