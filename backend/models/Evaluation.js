import mongoose from 'mongoose';

const ScoreSchema = new mongoose.Schema({
  score: { type: Number, min: 0, max: 10 },
  reason: { type: String }
}, { _id: false });

const EvaluationSchema = new mongoose.Schema({
  jobId: { type: String, required: true },
  query: { type: String, required: true },
  finalAnswer: { type: String },
  scores: {
    correctness: ScoreSchema,
    hallucinationResistance: ScoreSchema,
    citationQuality: ScoreSchema,
    contradictionHandling: ScoreSchema,
    synthesisSafety: ScoreSchema,
    confidenceCalibration: ScoreSchema,
    toolEfficiency: ScoreSchema,
    retryEfficiency: ScoreSchema,
    contextCompliance: ScoreSchema,
    critiqueQuality: ScoreSchema
  },
  overallScore: { type: Number },
  evaluator: { type: String, default: 'auto' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Evaluation', EvaluationSchema);
