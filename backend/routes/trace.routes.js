import express from 'express';
import { getTrace } from '../controllers/trace.controller.js';

const router = express.Router();

router.get('/:jobId', getTrace);

export default router;
