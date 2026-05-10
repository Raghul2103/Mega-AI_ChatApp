import Prompt from '../models/Prompt.js';
import PromptRewrite from '../models/PromptRewrite.js';

export const getPendingRewrites = async (req, res) => {
  try {
    const pending = await PromptRewrite.find({ status: 'pending' }).populate('promptId');
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const reviewPrompt = async (req, res) => {
  try {
    const { rewriteId, action } = req.body; 
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const rewrite = await PromptRewrite.findById(rewriteId);
    if (!rewrite) {
      return res.status(404).json({ error: 'Rewrite request not found' });
    }

    rewrite.status = action === 'approve' ? 'approved' : 'rejected';
    rewrite.reviewedAt = new Date();
    await rewrite.save();

    if (action === 'approve') {
      const prompt = await Prompt.findById(rewrite.promptId);
      if (prompt) {
        prompt.content = rewrite.newContent;
        prompt.version += 1;
        await prompt.save();
      }
    }

    res.json({ message: `Prompt rewrite ${action}d successfully`, rewrite });
  } catch (error) {
    console.error("Error reviewing prompt:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
