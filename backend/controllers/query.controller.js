import Job from '../models/Job.js';
import { orchestrator } from '../services/orchestrator.service.js';
import { v4 as uuidv4 } from 'uuid';

export const handleQuery = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = new Job({ jobId, query });
    await job.save();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    orchestrator(job._id, query, res);

    req.on('close', () => {
      console.log(`Client disconnected from job ${jobId}`);
    });

  } catch (error) {
    console.error("Error starting query:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
