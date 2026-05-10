import Job from '../models/Job.js';
import Log from '../models/Log.js';
import Trace from '../models/Trace.js';
import Hallucination from '../models/Hallucination.js';
import { routerAgent } from '../agents/router.agent.js';
import { decompositionAgent } from '../agents/decomposition.agent.js';
import { retrievalAgent } from '../agents/retrieval.agent.js';
import { critiqueAgent } from '../agents/critique.agent.js';
import { synthesisAgent } from '../agents/synthesis.agent.js';
import { compressionAgent } from '../agents/compression.agent.js';

class ContextBudgetManager {
  constructor(maxBudget = 8000) {
    this.maxBudget = maxBudget;
    this.tokensUsed = 0;
  }
  
  addTokens(amount) {
    this.tokensUsed += amount;
  }
  
  getRemaining() {
    return this.maxBudget - this.tokensUsed;
  }
  
  isOverflowing() {
    return this.tokensUsed >= this.maxBudget;
  }
}

async function sendSSEEvent(res, type, data) {
  if (res && res.write) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

async function logAction(jobId, agent, eventType, message, metadata = {}, latency = 0, tokenUsage = 0, confidence = 0) {
  const log = new Log({ jobId, agent, eventType, message, metadata, latency, tokenUsage, confidence, policyViolation: metadata.policyViolation || false });
  await log.save();
  return log;
}

export async function orchestrator(jobId, query, res) {
  const trace = new Trace({ jobId, query, steps: [] });
  await trace.save();
  
  const budget = new ContextBudgetManager(8000);
  let totalLatency = 0;
  let sharedContext = { jobId, query, tasks: [], toolResults: [], critique: null, finalAnswer: "", isSafe: true };

  try {
    await Job.findByIdAndUpdate(jobId, { status: 'running' });
    sendSSEEvent(res, 'status', { message: '[ORCHESTRATOR_STARTED] Initializing pipeline' });
    await logAction(jobId, 'Orchestrator', 'ORCHESTRATOR_STARTED', 'Job initialized');
    sendSSEEvent(res, 'stream', { eventType: 'STREAM_STARTED', jobId });
    
    let isComplete = false;
    let loopCount = 0;
    const maxLoops = 10;

    while (!isComplete && loopCount < maxLoops) {
      loopCount++;
      
      // Dynamic Routing
      const routeStart = Date.now();
      sendSSEEvent(res, 'telemetry', { type: 'ACTIVE_AGENT', agent: 'Router Agent' });
      const routeDecision = await routerAgent(query, sharedContext);
      const routeLatency = Date.now() - routeStart;
      budget.addTokens(100); 
      totalLatency += routeLatency;
      
      sendSSEEvent(res, 'telemetry', { type: 'LATENCY_UPDATE', latency: totalLatency });
      sendSSEEvent(res, 'telemetry', { type: 'TOKEN_UPDATE', used: budget.tokensUsed, max: budget.maxBudget });
      
      await logAction(jobId, 'Router', 'ROUTING_DECISION', `Routed to ${routeDecision.selectedAgent}`, { decision: routeDecision }, routeLatency, 100, routeDecision.confidence);
      sendSSEEvent(res, 'status', { message: `[ROUTING] Selected ${routeDecision.selectedAgent} (${Math.round(routeDecision.confidence*100)}% conf)` });
      trace.steps.push({ agent: 'Router', event: `Routed to ${routeDecision.selectedAgent}`, status: 'success', latency: routeLatency });

      // Context Overflow Check
      if (budget.isOverflowing()) {
        sendSSEEvent(res, 'telemetry', { type: 'ACTIVE_AGENT', agent: 'Compression Agent' });
        sendSSEEvent(res, 'status', { message: '[COMPRESSION_STARTED] Context overflow detected' });
        await logAction(jobId, 'Orchestrator', 'POLICY_VIOLATION', 'Token budget exceeded', { policyViolation: true });
        
        const compStart = Date.now();
        const compressed = await compressionAgent(sharedContext);
        const compLatency = Date.now() - compStart;
        totalLatency += compLatency;
        
        sharedContext = { ...sharedContext, ...compressed.compressedContext };
        budget.tokensUsed = Math.floor(budget.tokensUsed * 0.6); // Simulate reduction
        
        sendSSEEvent(res, 'telemetry', { type: 'LATENCY_UPDATE', latency: totalLatency });
        sendSSEEvent(res, 'telemetry', { type: 'TOKEN_UPDATE', used: budget.tokensUsed, max: budget.maxBudget });
        
        await logAction(jobId, 'Compression', 'COMPRESSION_COMPLETED', 'Context compressed', { reduction: compressed.reductionPercentage }, compLatency, 50);
        trace.steps.push({ agent: 'Compression', event: 'Context reduced', status: 'success', latency: compLatency });
      }

      let { selectedAgent } = routeDecision;

      // Deterministic State Machine Guard Rails
      if (selectedAgent === 'Decomposition' && sharedContext.tasks && sharedContext.tasks.length > 0) {
        console.warn(`[Orchestrator Guard] Overriding routing decision 'Decomposition' to 'Retrieval' because tasks already exist.`);
        sendSSEEvent(res, 'status', { message: `[STATE_GUARD] Loop prevented: Diverting Decomposition to Retrieval` });
        selectedAgent = 'Retrieval';
      }
      if (selectedAgent === 'Retrieval' && sharedContext.toolResults && sharedContext.toolResults.length > 0) {
        console.warn(`[Orchestrator Guard] Overriding routing decision 'Retrieval' to 'Critique' because toolResults already exist.`);
        sendSSEEvent(res, 'status', { message: `[STATE_GUARD] Loop prevented: Diverting Retrieval to Critique` });
        selectedAgent = 'Critique';
      }
      if (selectedAgent === 'Critique' && sharedContext.critique) {
        console.warn(`[Orchestrator Guard] Overriding routing decision 'Critique' to 'Synthesis' because critique already exists.`);
        sendSSEEvent(res, 'status', { message: `[STATE_GUARD] Loop prevented: Diverting Critique to Synthesis` });
        selectedAgent = 'Synthesis';
      }
      if (selectedAgent === 'Synthesis' && sharedContext.finalAnswer) {
        console.warn(`[Orchestrator Guard] Overriding routing decision 'Synthesis' to 'Complete' because finalAnswer already exists.`);
        sendSSEEvent(res, 'status', { message: `[STATE_GUARD] Loop prevented: Diverting Synthesis to Complete` });
        selectedAgent = 'Complete';
      }

      if (selectedAgent === 'Decomposition') {
        sendSSEEvent(res, 'telemetry', { type: 'ACTIVE_AGENT', agent: 'Decomposition Agent' });
        sendSSEEvent(res, 'status', { message: '[AGENT_STARTED] Decomposition Agent' });
        const start = Date.now();
        const result = await decompositionAgent(query);
        const latency = Date.now() - start;
        totalLatency += latency;
        const tokens = 50; budget.addTokens(tokens);
        
        sendSSEEvent(res, 'telemetry', { type: 'LATENCY_UPDATE', latency: totalLatency });
        sendSSEEvent(res, 'telemetry', { type: 'TOKEN_UPDATE', used: budget.tokensUsed, max: budget.maxBudget });
        
        sharedContext.tasks = result.tasks || [query];
        await logAction(jobId, 'Decomposition', 'AGENT_COMPLETED', 'Decomposition complete', { output: result }, latency, tokens);
        trace.steps.push({ agent: 'Decomposition', event: 'Task generation', status: 'success', latency });
      }
      
      else if (selectedAgent === 'Retrieval') {
        sendSSEEvent(res, 'telemetry', { type: 'ACTIVE_AGENT', agent: 'Retrieval Agent' });
        sendSSEEvent(res, 'status', { message: '[AGENT_STARTED] Retrieval Agent' });
        const start = Date.now();
        const result = await retrievalAgent(sharedContext.tasks, jobId); 
        const latency = Date.now() - start;
        totalLatency += latency;
        const tokens = 100; budget.addTokens(tokens);
        
        sendSSEEvent(res, 'telemetry', { type: 'LATENCY_UPDATE', latency: totalLatency });
        sendSSEEvent(res, 'telemetry', { type: 'TOKEN_UPDATE', used: budget.tokensUsed, max: budget.maxBudget });
        
        sharedContext.toolResults = result.toolResults || [];
        await logAction(jobId, 'Retrieval', 'AGENT_COMPLETED', 'Retrieval complete', { output: result }, latency, tokens);
        trace.steps.push({ agent: 'Retrieval', event: 'Data gathering', status: 'success', latency });
      }
      
      else if (selectedAgent === 'Critique') {
        sendSSEEvent(res, 'telemetry', { type: 'ACTIVE_AGENT', agent: 'Critique Agent' });
        sendSSEEvent(res, 'status', { message: '[CRITIQUE_STARTED] Critique Agent Reviewing' });
        const start = Date.now();
        const result = await critiqueAgent(sharedContext.toolResults);
        const latency = Date.now() - start;
        totalLatency += latency;
        const tokens = 150; budget.addTokens(tokens);
        
        sendSSEEvent(res, 'telemetry', { type: 'LATENCY_UPDATE', latency: totalLatency });
        sendSSEEvent(res, 'telemetry', { type: 'TOKEN_UPDATE', used: budget.tokensUsed, max: budget.maxBudget });
        
        sharedContext.critique = result;
        
        if (result.issue) {
          await logAction(jobId, 'Critique', 'POLICY_VIOLATION', 'Hallucination Detected', { policyViolation: true, issue: result.issue }, latency, tokens, result.confidence);
          
          let claimStr = result.claim;
          if (typeof claimStr === 'object' && claimStr !== null) {
            claimStr = claimStr.claim || claimStr.text || JSON.stringify(claimStr);
          }
          claimStr = claimStr || "Critique failed";

          await Hallucination.create({ 
            jobId, 
            agent: 'Critique', 
            claim: claimStr, 
            reason: result.issue, 
            confidence: result.confidence || 0, 
            suppressed: false 
          });
          sendSSEEvent(res, 'telemetry', { 
            type: 'POLICY_VIOLATION', 
            claim: claimStr, 
            reason: result.issue, 
            confidence: result.confidence || 0, 
            suppressed: false 
          });
          sendSSEEvent(res, 'status', { message: '[HALLUCINATION_DETECTED] Warning triggered' });
        } else {
          await logAction(jobId, 'Critique', 'CRITIQUE_COMPLETED', 'Critique complete', { output: result }, latency, tokens, result.confidence);
        }
        trace.steps.push({ agent: 'Critique', event: 'Validation', status: 'success', latency });
      }
      
      else if (selectedAgent === 'Synthesis') {
        sendSSEEvent(res, 'telemetry', { type: 'ACTIVE_AGENT', agent: 'Synthesis Agent' });
        sendSSEEvent(res, 'status', { message: '[SYNTHESIS_STARTED] Synthesis Agent Validating' });
        const start = Date.now();
        const result = await synthesisAgent(sharedContext.toolResults, sharedContext.critique);
        const latency = Date.now() - start;
        totalLatency += latency;
        const tokens = 200; budget.addTokens(tokens);
        
        sendSSEEvent(res, 'telemetry', { type: 'LATENCY_UPDATE', latency: totalLatency });
        sendSSEEvent(res, 'telemetry', { type: 'TOKEN_UPDATE', used: budget.tokensUsed, max: budget.maxBudget });
        
        sharedContext.finalAnswer = result.finalAnswer;
        sharedContext.isSafe = result.isSafe;
        sharedContext.provenance = result.provenance || [];
        sharedContext.suppressedClaims = result.suppressedClaims || [];
        sharedContext.policyViolation = result.policyViolation || false;
        
        if (!result.isSafe || result.policyViolation) {
          const suppressedClaims = result.suppressedClaims || [];
          for (const claim of suppressedClaims) {
            let claimStr = claim;
            if (typeof claimStr === 'object' && claimStr !== null) {
              claimStr = claimStr.claim || claimStr.text || JSON.stringify(claimStr);
            }
            claimStr = claimStr || "Suppressed claim";

            await Hallucination.create({
              jobId,
              agent: 'Synthesis',
              claim: claimStr,
              reason: result.warnings?.join(', ') || 'Unsupported numerical claim',
              confidence: result.confidence || 0.5,
              suppressed: true
            });
            sendSSEEvent(res, 'telemetry', {
              type: 'POLICY_VIOLATION',
              claim: claimStr,
              reason: result.warnings?.join(', ') || 'Unsupported numerical claim',
              confidence: result.confidence || 0.5,
              suppressed: true
            });
          }
          await logAction(jobId, 'Synthesis', 'POLICY_VIOLATION', 'Suppressed unsafe claims during synthesis', { policyViolation: true, warnings: result.warnings, suppressedClaims: result.suppressedClaims }, latency, tokens, result.confidence);
        }

        await logAction(jobId, 'Synthesis', 'SYNTHESIS_COMPLETED', 'Synthesis complete', { output: result }, latency, tokens, result.confidence);
        trace.steps.push({ agent: 'Synthesis', event: 'Final response generation', status: 'success', latency });
      }
      
      else if (selectedAgent === 'Complete') {
        isComplete = true;
      }
    }

    // Finalize
    await Job.findByIdAndUpdate(jobId, { status: 'completed', finalAnswer: sharedContext.finalAnswer });
    trace.totalTokens = budget.tokensUsed;
    trace.totalLatency = totalLatency;
    await trace.save();
    
    await logAction(jobId, 'Orchestrator', 'JOB_COMPLETED', 'Pipeline finished successfully', {}, totalLatency, budget.tokensUsed);
    sendSSEEvent(res, 'stream', { eventType: 'STREAM_COMPLETED' });
    sendSSEEvent(res, 'complete', { finalAnswer: sharedContext.finalAnswer, provenance: sharedContext.provenance || [] });
    if (res) res.end();

    return sharedContext;
  } catch (error) {
    console.error("Orchestrator error:", error);
    await Job.findByIdAndUpdate(jobId, { status: 'failed' });
    await logAction(jobId, 'Orchestrator', 'JOB_FAILED', error.message);
    sendSSEEvent(res, 'error', { message: error.message });
    if (res) res.end();
  }
}
