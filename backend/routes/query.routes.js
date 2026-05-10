import express from 'express';
import { handleQuery } from '../controllers/query.controller.js';

const router = express.Router();

router.post('/', handleQuery);

export default router;
