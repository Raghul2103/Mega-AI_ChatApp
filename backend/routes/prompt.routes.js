import express from 'express';
import { getPendingRewrites, reviewPrompt } from '../controllers/prompt.controller.js';

const router = express.Router();

router.get('/pending', getPendingRewrites);
router.post('/review', reviewPrompt);

export default router;
