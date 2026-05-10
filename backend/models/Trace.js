import mongoose from 'mongoose';

const TraceSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  query: { type: String, required: true },
  steps: [{
    agent: String,
    event: String,
    timestamp: { type: Date, default: Date.now },
    status: String,
    latency: Number,
    exactPrompt: String,
    exactOutput: mongoose.Schema.Types.Mixed
  }],
  totalTokens: { type: Number, default: 0 },
  totalLatency: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Trace', TraceSchema);
