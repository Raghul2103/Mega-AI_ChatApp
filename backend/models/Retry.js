import mongoose from 'mongoose';

const RetrySchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  toolName: { type: String },
  agent: { type: String },
  attemptNumber: { type: Number, required: true },
  error: { type: String },
  latency: { type: Number },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('Retry', RetrySchema);
