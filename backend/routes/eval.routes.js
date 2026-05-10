import express from 'express';
import { getLatestEvals, reevaluateJob } from '../controllers/eval.controller.js';
import { runEvaluationPipeline, runTargetedReevaluation } from '../services/evaluator.service.js';

const router = express.Router();

router.get('/latest', getLatestEvals);
router.post('/reevaluate', async (req, res) => {
  try {
    runEvaluationPipeline();
    res.json({ message: "Evaluation pipeline started in the background." });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/targeted', async (req, res) => {
  try {
    runTargetedReevaluation();
    res.json({ message: "Targeted re-evaluation started on failed cases in the background." });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
