import mongoose from 'mongoose';

const promptRewriteSchema = new mongoose.Schema({
  promptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prompt' },
  oldContent: { type: String, required: true },
  newContent: { type: String, required: true },
  diff: { type: String, required: true },
  justification: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedAt: { type: Date },
  performanceDelta: {
    before: { type: Number, default: 0 },
    after: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('PromptRewrite', promptRewriteSchema);
