import mongoose from 'mongoose';

const promptSchema = new mongoose.Schema({
  name: { type: String, required: true },
  content: { type: String, required: true },
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Prompt', promptSchema);
