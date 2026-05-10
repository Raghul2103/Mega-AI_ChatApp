import mongoose from 'mongoose';

const HallucinationSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  agent: { type: String },
  claim: { type: String, required: true },
  reason: { type: String },
  confidence: { type: Number, default: 0 },
  suppressed: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('Hallucination', HallucinationSchema);
