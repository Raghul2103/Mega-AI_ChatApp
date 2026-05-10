import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/antigravity');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
  }
};

connectDB();

import queryRoutes from './routes/query.routes.js';
import evalRoutes from './routes/eval.routes.js';
import promptRoutes from './routes/prompt.routes.js';
import traceRoutes from './routes/trace.routes.js';

app.use('/api/query', queryRoutes);
app.use('/api/evals', evalRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/trace', traceRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
