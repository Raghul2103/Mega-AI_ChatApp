import mongoose from 'mongoose';

const LogSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now },
  agent: { type: String },
  eventType: { type: String, required: true },
  status: { type: String },
  latency: { type: Number, default: 0 },
  tokenUsage: { type: Number, default: 0 },
  inputHash: { type: String },
  outputHash: { type: String },
  toolName: { type: String },
  retryCount: { type: Number, default: 0 },
  confidence: { type: Number, default: 0.0 },
  policyViolation: { type: Boolean, default: false },
  message: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }
});

export default mongoose.model('Log', LogSchema);
