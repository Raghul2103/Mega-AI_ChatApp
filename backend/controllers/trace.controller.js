import Trace from '../models/Trace.js';
import Job from '../models/Job.js';
import Log from '../models/Log.js';
import ToolCall from '../models/ToolCall.js';
import Retry from '../models/Retry.js';
import Hallucination from '../models/Hallucination.js';

export const getTrace = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await Job.findOne({ jobId: jobId }) || await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const trace = await Trace.findOne({ jobId: job._id });
    const logs = await Log.find({ jobId: job._id }).sort({ timestamp: 1 });
    const toolCalls = await ToolCall.find({ jobId: job._id }).sort({ timestamp: 1 });
    const retries = await Retry.find({ jobId: job._id }).sort({ timestamp: 1 });
    const hallucinations = await Hallucination.find({ jobId: job._id }).sort({ timestamp: 1 });

    // Dynamic trace reconstruction of execution hierarchy tree
    let steps = [];
    if (trace && trace.steps) {
      steps = trace.steps.map((step, idx) => {
        const stepObj = step.toObject ? step.toObject() : step;
        const children = [];

        if (stepObj.agent === 'Retrieval') {
          toolCalls.forEach(tc => {
            children.push({
              type: 'tool_call',
              agent: 'Retrieval Agent',
              tool: tc.toolName,
              args: tc.args,
              status: tc.status,
              latency: tc.latency,
              timestamp: tc.timestamp
            });
          });

          retries.forEach(r => {
            children.push({
              type: 'retry',
              agent: r.agent || 'Retrieval Agent',
              tool: r.toolName,
              attemptNumber: r.attemptNumber,
              error: r.error,
              latency: r.latency,
              timestamp: r.timestamp
            });
          });
        }

        return {
          step: idx + 1,
          agent: stepObj.agent,
          event: stepObj.event,
          status: stepObj.status || 'completed',
          latency: stepObj.latency,
          timestamp: stepObj.timestamp,
          exactPrompt: stepObj.exactPrompt,
          exactOutput: stepObj.exactOutput,
          children
        };
      });
    }

    res.json({
      job,
      trace: trace ? { ...trace.toObject(), steps } : null,
      logs,
      toolCalls,
      retries,
      hallucinations
    });
  } catch (error) {
    console.error("Error fetching trace:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
