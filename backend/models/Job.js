import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  query: { type: String, required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  tasks: [{ type: String }],
  toolResults: [{ type: mongoose.Schema.Types.Mixed }],
  critique: [{ type: mongoose.Schema.Types.Mixed }],
  finalAnswer: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Job', JobSchema);
