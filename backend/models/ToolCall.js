import mongoose from 'mongoose';

const ToolCallSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  toolName: { type: String, required: true },
  args: { type: mongoose.Schema.Types.Mixed },
  result: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ['success', 'failed'], required: true },
  latency: { type: Number },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('ToolCall', ToolCallSchema);
