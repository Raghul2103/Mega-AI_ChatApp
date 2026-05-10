import Evaluation from '../models/Evaluation.js';

export const getLatestEvals = async (req, res) => {
  try {
    const evals = await Evaluation.find().sort({ createdAt: -1 }).limit(15);
    res.json(evals);
  } catch (error) {
    console.error("Error fetching evals:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const reevaluateJob = async (req, res) => {
  try {
    const { jobId } = req.body;
    res.json({ message: `Re-evaluation triggered for job ${jobId}` });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
