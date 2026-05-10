import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Job from './models/Job.js';
import { orchestrator } from './services/orchestrator.service.js';

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/antigravity');
    console.log(`[Worker] Connected to MongoDB: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Worker] Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const processQueue = async () => {
  try {
    // Poll for the oldest pending job
    const job = await Job.findOne({ status: 'pending' }).sort({ createdAt: 1 });
    
    if (job) {
      console.log(`[Worker] Processing pending job: ${job.jobId} (${job.query})`);
      
      // Update status to running
      job.status = 'running';
      await job.save();
      
      // Execute the master orchestrator asynchronously without HTTP response streaming
      try {
        const mockRes = { write: () => {}, end: () => {} };
        await orchestrator(job._id, job.query, mockRes);
        
        job.status = 'completed';
        await job.save();
        console.log(`[Worker] Completed job ${job.jobId}`);
      } catch (err) {
        console.error(`[Worker] Failed to process job ${job.jobId}:`, err);
        job.status = 'failed';
        await job.save();
      }
    }
  } catch (err) {
    console.error('[Worker] Error during queue polling:', err);
  }
  
  // Schedule next poll interval
  setTimeout(processQueue, 3000);
};

const startWorker = async () => {
  await connectDB();
  console.log('[Worker] Active and polling Job queue every 3 seconds...');
  processQueue();
};

startWorker();
