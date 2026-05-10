import React, { useState, useRef, useEffect } from 'react';
import { Play, Send, Activity, ShieldAlert, Cpu, Network, CheckCircle, Database } from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const cleanErrorMessage = (msg) => {
  if (!msg) return 'An unexpected error occurred.';
  const jsonStart = msg.indexOf('{');
  const jsonEnd = msg.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    try {
      const jsonStr = msg.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      const innerMsg = parsed.error?.message || parsed.message;
      if (innerMsg) {
        const prefix = msg.substring(0, jsonStart).trim();
        return prefix ? `${prefix}: ${innerMsg}` : innerMsg;
      }
    } catch (e) {
      console.error("Failed to parse error JSON substring", e);
    }
  }
  return msg;
};

function App() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('logs');
  const [evals, setEvals] = useState([]);
  const [hallucinations, setHallucinations] = useState([]);
  const [provenance, setProvenance] = useState([]);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [trace, setTrace] = useState(null);
  
  // LIVE TELEMETRY STATES
  const [liveAgent, setLiveAgent] = useState('Idle');
  const [liveLatency, setLiveLatency] = useState(0);
  const [liveTokens, setLiveTokens] = useState({ used: 0, max: 8000 });
  const [liveTraceSteps, setLiveTraceSteps] = useState([]);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => scrollToBottom(messagesEndRef), [messages]);

  const fetchEvals = async () => {
    try {
      const res = await fetch(`${API_URL}/evals/latest`);
      const data = await res.json();
      setEvals(data);
    } catch (e) { console.error("Failed to fetch evals", e); }
  };

  const fetchTrace = async (jobId) => {
    try {
      const res = await fetch(`${API_URL}/trace/${jobId}`);
      const data = await res.json();
      setTrace(data.trace);
      setLogs(data.logs.map(l => ({ time: new Date(l.timestamp).toLocaleTimeString(), type: l.eventType, msg: l.message, ...l })));
      setHallucinations(data.hallucinations || []);
    } catch (e) { console.error("Failed to fetch trace", e); }
  };

  const triggerEvaluation = async () => {
    try {
      setIsEvaluating(true);
      setActiveTab('evals');
      await fetch(`${API_URL}/evals/reevaluate`, { method: 'POST' });
    } catch(e) {
      setIsEvaluating(false);
    }
  };

  // Evals dynamic polling loop
  useEffect(() => {
    let interval;
    if (isEvaluating) {
      fetchEvals();
      interval = setInterval(() => {
        fetchEvals();
      }, 3000);

      // Stop polling after 60 seconds (enough time to complete test cases with sleep)
      const timeout = setTimeout(() => {
        setIsEvaluating(false);
        clearInterval(interval);
      }, 60000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isEvaluating]);

  useEffect(() => {
    if (activeTab === 'evals' && !isEvaluating) fetchEvals();
    // Only fetch final trace if not currently streaming
    if (!isStreaming && currentJobId && ['traces', 'logs'].includes(activeTab)) {
      fetchTrace(currentJobId);
    }
  }, [activeTab, currentJobId, isStreaming]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || isStreaming) return;

    const userMessage = { id: Date.now(), role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsStreaming(true);
    setLogs([]);
    setHallucinations([]);
    setProvenance([]);
    setTrace(null);
    setLiveTraceSteps([]);
    setLiveLatency(0);
    setLiveTokens({ used: 0, max: 8000 });
    setLiveAgent('Orchestrator Started');

    try {
      const response = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let agentMessageId = Date.now() + 1;
      setMessages(prev => [...prev, { id: agentMessageId, role: 'agent', content: '', status: 'Initializing...' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const parts = line.split('\ndata: ');
            if (parts.length === 2) {
              const eventType = parts[0].substring(7);
              const data = JSON.parse(parts[1]);

              if (eventType === 'status') {
                setMessages(prev => prev.map(m => m.id === agentMessageId ? { ...m, status: data.message } : m));
                setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), type: 'STATUS', msg: data.message }]);
                if (data.message.includes('HALLUCINATION') || data.message.includes('POLICY_VIOLATION') || data.message.includes('warning')) {
                   setHallucinations(prev => prev.includes(data.message) ? prev : [...prev, data.message]);
                }
              } else if (eventType === 'telemetry') {
                if (data.type === 'ACTIVE_AGENT') {
                  setLiveAgent(data.agent);
                  setLiveTraceSteps(prev => [...prev, { agent: data.agent, event: 'Running...', latency: '...' }]);
                } else if (data.type === 'LATENCY_UPDATE') {
                  setLiveLatency(data.latency);
                  // Update latency of the last step
                  setLiveTraceSteps(prev => {
                    if (prev.length === 0) return prev;
                    const newArr = [...prev];
                    newArr[newArr.length - 1].latency = data.latency;
                    return newArr;
                  });
                } else if (data.type === 'TOKEN_UPDATE') {
                  setLiveTokens({ used: data.used, max: data.max });
                } else if (data.type === 'POLICY_VIOLATION') {
                  setHallucinations(prev => {
                    if (prev.some(h => typeof h === 'object' && h !== null && h.claim === data.claim)) return prev;
                    return [...prev, {
                      claim: data.claim,
                      reason: data.reason,
                      confidence: data.confidence,
                      suppressed: data.suppressed
                    }];
                  });
                }
              } else if (eventType === 'complete') {
                setMessages(prev => prev.map(m => m.id === agentMessageId ? { ...m, content: data.finalAnswer, status: 'Complete' } : m));
                setProvenance(data.provenance || []);
                setIsStreaming(false);
                setLiveAgent('Idle');
              } else if (eventType === 'stream' && data.eventType === 'STREAM_STARTED') {
                setCurrentJobId(data.jobId);
              } else if (eventType === 'error') {
                const cleanMsg = cleanErrorMessage(data.message);
                setMessages(prev => prev.map(m => m.id === agentMessageId ? { ...m, content: cleanMsg, status: 'Failed' } : m));
                setIsStreaming(false);
                setLiveAgent('Idle');
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Stream error", error);
      setIsStreaming(false);
      setLiveAgent('Idle');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen p-2 sm:p-4 gap-3 sm:gap-4 bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* Left Chat Column */}
      <div className="glass-panel w-full lg:max-w-md xl:max-w-2xl h-[45vh] lg:h-full flex flex-col border border-white/5 rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 shadow-[0_0_50px_rgba(0,0,0,0.5)] shrink-0">
        <div className="p-4 sm:p-5 border-b border-white/5 flex items-center justify-between bg-slate-900/90 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 font-bold text-lg sm:text-xl tracking-wide">
            <Activity className="text-emerald-400 w-5 h-5 sm:w-6 sm:h-6" />
            <span className="bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">Mega AI</span>
          </div>
          <button onClick={triggerEvaluation} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-[10px] sm:text-xs hover:bg-slate-700 transition font-semibold tracking-wider">
            RUN EVALS
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`max-w-[90%] sm:max-w-[85%] p-4 sm:p-5 rounded-xl sm:rounded-2xl ${msg.role === 'user' ? 'self-end bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg' : 'self-start bg-slate-800/80 border border-slate-700 shadow-lg'}`}>
              {msg.role === 'agent' && (
                <div className="text-[9px] sm:text-[10px] text-blue-400 font-mono mb-2 sm:mb-3 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
                  {msg.status}
                </div>
              )}
              {msg.content ? (
                <div className="prose prose-invert text-sm sm:text-[15px] leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
              ) : (
                <div className="flex flex-col gap-2 w-40 sm:w-56 py-1">
                  <div className="h-2.5 bg-slate-700/50 rounded-full w-full animate-[pulse_1.5s_infinite_0s]"></div>
                  <div className="h-2.5 bg-slate-700/50 rounded-full w-11/12 animate-[pulse_1.5s_infinite_0.2s]"></div>
                  <div className="h-2.5 bg-slate-700/50 rounded-full w-3/4 animate-[pulse_1.5s_infinite_0.4s]"></div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="p-3 sm:p-5 border-t border-white/5 bg-slate-900/90 backdrop-blur-xl flex gap-2 sm:gap-3 shrink-0" onSubmit={handleSubmit}>
          <input 
            type="text" 
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm outline-none focus:border-emerald-500/50 transition-colors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Query the multi-agent system..."
            disabled={isStreaming}
          />
          <button type="submit" disabled={isStreaming} className="bg-emerald-600 px-4 sm:px-5 rounded-xl text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:grayscale flex items-center justify-center">
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </form>
      </div>

      {/* Right Observability Dashboard Column */}
      <div className="flex-1 lg:flex-[2] flex flex-col gap-3 sm:gap-4 h-[50vh] lg:h-full min-h-0 w-full">
        
        {/* Top Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 shrink-0">
          <div className="glass-panel p-3 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/80 border border-white/5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-10"><Cpu className="w-8 h-8 sm:w-12 sm:h-12" /></div>
            <div className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10">Active Agent</div>
            <div className="text-sm sm:text-base md:text-xl font-medium text-emerald-400 mt-1 sm:mt-2 z-10 truncate">{liveAgent}</div>
          </div>
          <div className="glass-panel p-3 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/80 border border-white/5 flex flex-col justify-between relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-10"><ShieldAlert className="w-8 h-8 sm:w-12 sm:h-12" /></div>
            <div className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10">Violations</div>
            <div className="text-sm sm:text-base md:text-xl font-medium text-red-400 mt-1 sm:mt-2 z-10">{hallucinations.length} Detected</div>
          </div>
          <div className="glass-panel p-3 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/80 border border-white/5 flex flex-col justify-between relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-10"><Database className="w-8 h-8 sm:w-12 sm:h-12" /></div>
            <div className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10">Context</div>
            <div className="text-sm sm:text-base md:text-xl font-medium text-blue-400 mt-1 sm:mt-2 z-10">{isStreaming ? liveTokens.used : (trace ? trace.totalTokens : '0')} <span className="text-[10px] sm:text-xs text-slate-600">/ 8k</span></div>
          </div>
          <div className="glass-panel p-3 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/80 border border-white/5 flex flex-col justify-between relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-10"><Play className="w-8 h-8 sm:w-12 sm:h-12" /></div>
            <div className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10">Latency</div>
            <div className="text-sm sm:text-base md:text-xl font-medium text-amber-400 mt-1 sm:mt-2 z-10">{isStreaming ? `${liveLatency}ms` : (trace ? `${trace.totalLatency}ms` : '0ms')}</div>
          </div>
        </div>

        {/* Tabbed Main Panel */}
        <div className="glass-panel flex-1 flex flex-col border border-white/5 rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900/80 shadow-[0_0_50px_rgba(0,0,0,0.3)] min-h-0">
          <div className="flex border-b border-white/5 bg-slate-900/90 backdrop-blur-xl overflow-x-auto whitespace-nowrap scrollbar-none shrink-0">
            {['logs', 'traces', 'provenance', 'evals', 'hallucinations'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 min-w-[90px] sm:min-w-0 py-3 sm:py-4 text-[9px] sm:text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400 bg-white/5' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
            
            {activeTab === 'logs' && (
              <div className="font-mono text-[10px] sm:text-[11px] flex flex-col gap-1.5">
                {logs.length === 0 ? <span className="text-slate-600 text-center block mt-10">Awaiting telemetry...</span> :
                  logs.map((log, i) => (
                    <div key={i} className="flex flex-col sm:flex-row gap-1 sm:gap-4 py-1 sm:py-1.5 hover:bg-white/5 rounded px-2 transition-colors">
                      <span className="text-slate-600 shrink-0 w-20">[{log.time}]</span>
                      <span className={`shrink-0 w-auto sm:w-48 font-bold ${log.type?.includes('ERROR') || log.type?.includes('FAILED') ? 'text-red-400' : log.type?.includes('VIOLATION') || log.type?.includes('HALLUCINATION') ? 'text-orange-400' : 'text-emerald-400'}`}>[{log.type}]</span>
                      <span className="text-slate-300 break-all sm:break-normal">{log.msg}</span>
                    </div>
                  ))
                }
              </div>
            )}

            {activeTab === 'traces' && (
              <div className="py-2">
                {!trace && !isStreaming ? <div className="text-slate-600 text-center mt-10 text-xs sm:text-sm">No execution trace active.</div> : (
                  <div className="relative pl-4 sm:pl-6 space-y-6 sm:space-y-8 before:absolute before:inset-0 before:ml-[9px] sm:before:ml-[11px] before:-translate-x-px before:h-full before:w-px before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
                    {(isStreaming ? liveTraceSteps : trace.steps).map((step, idx) => (
                      <div key={idx} className="relative flex flex-col gap-3 group is-active">
                        <div className="flex items-center">
                          <div className="flex items-center justify-center w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-slate-900 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] shrink-0 z-10"></div>
                          <div className="ml-3 sm:ml-5 w-full glass-panel p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-white/5 bg-slate-800/50 shadow-lg hover:bg-slate-800 transition-colors">
                            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                              <h3 className="font-bold text-emerald-400 text-xs sm:text-sm">{step.agent}</h3>
                              <time className="font-mono text-[9px] sm:text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 sm:py-1 rounded-md">{step.latency}ms</time>
                            </div>
                            <div className="text-slate-300 text-xs sm:text-sm">{step.event || 'Executing Agent Pipeline Tasks...'}</div>
                          </div>
                        </div>

                        {step.children && step.children.length > 0 && (
                          <div className="pl-6 sm:pl-10 ml-2 sm:ml-3 flex flex-col gap-2 border-l border-slate-800">
                            {step.children.map((child, cIdx) => (
                              <div key={cIdx} className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs flex flex-col gap-1 shadow-inner">
                                <div className="flex justify-between items-center mb-1">
                                  <span className={`font-mono text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${child.type === 'retry' ? 'bg-red-500/10 text-red-400' : 'bg-purple-500/10 text-purple-400'}`}>
                                    {child.type === 'retry' ? 'Retry Attempt' : 'Tool Execution'}
                                  </span>
                                  <span className="font-mono text-[9px] text-slate-500">{child.latency}ms</span>
                                </div>
                                <div className="text-slate-300 font-medium">
                                  {child.type === 'retry' ? (
                                    <span>Failed on <code className="bg-slate-950 px-1 py-0.5 rounded text-red-300">{child.tool}</code>: {child.error}</span>
                                  ) : (
                                    <span>Invoked <code className="bg-slate-950 px-1.5 py-0.5 rounded text-purple-300">{child.tool}</code> with <span className="text-slate-400">{JSON.stringify(child.args)}</span></span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'provenance' && (
              <div className="flex flex-col gap-3 sm:gap-4">
                {provenance.length === 0 ? <div className="text-center text-slate-600 text-xs sm:text-sm mt-10">No provenance maps available.</div> :
                  provenance.map((prov, idx) => (
                    <div key={idx} className="p-4 sm:p-5 bg-slate-800/50 border border-slate-700 rounded-xl sm:rounded-2xl">
                      <div className="text-slate-200 font-medium mb-3 sm:mb-4 text-xs sm:text-[15px] border-l-2 border-emerald-500 pl-3 sm:pl-4">{prov.sentence}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] sm:text-xs">
                        <div><div className="text-slate-500 uppercase tracking-wider text-[8px] sm:text-[9px] font-bold mb-1">Source Agent</div><div className="text-blue-400 flex items-center gap-1 truncate"><Network size={12}/>{prov.sourceAgent}</div></div>
                        <div><div className="text-slate-500 uppercase tracking-wider text-[8px] sm:text-[9px] font-bold mb-1">Source Tool</div><div className="text-purple-400 truncate">{prov.sourceTool}</div></div>
                        <div><div className="text-slate-500 uppercase tracking-wider text-[8px] sm:text-[9px] font-bold mb-1">Confidence Score</div><div className="text-amber-400 font-mono font-bold">{prov.confidence !== undefined ? prov.confidence : '0.90'}</div></div>
                        <div className="sm:col-span-3 mt-1.5 sm:mt-2"><div className="text-slate-500 uppercase tracking-wider text-[8px] sm:text-[9px] font-bold mb-1">Raw Evidence Chunk</div><div className="text-slate-400 italic bg-slate-950 p-2.5 sm:p-3 rounded-lg border border-slate-800 text-[10px] sm:text-xs">{prov.sourceChunk}</div></div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {activeTab === 'evals' && (
              <div className="flex flex-col gap-4">
                {isEvaluating && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between text-emerald-400 font-medium animate-pulse shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
                      <span className="text-xs sm:text-sm">Evaluation pipeline actively running (15 test cases)...</span>
                    </div>
                    <div className="text-[10px] sm:text-xs text-emerald-500/70 font-mono">Real-time updates enabled</div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {evals.length === 0 ? <div className="col-span-full text-center text-slate-600 text-xs sm:text-sm mt-10">Run evaluation pipeline to view scorecard.</div> :
                    evals.map(ev => (
                      <div key={ev._id} className="glass-panel p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 bg-slate-800/50 hover:bg-slate-800 transition-colors">
                        <div className="flex justify-between items-center mb-4 sm:mb-6">
                          <div className="text-[9px] sm:text-[10px] font-mono text-slate-500 truncate max-w-[120px] sm:max-w-[150px]">{ev.jobId}</div>
                          <div className={`text-base sm:text-xl font-bold ${ev.overallScore >= 8 ? 'text-emerald-400' : ev.overallScore >= 5 ? 'text-amber-400' : 'text-red-400'}`}>Score: {ev.overallScore}/10</div>
                        </div>
                        <div className="space-y-2.5 sm:space-y-3 text-[11px] sm:text-xs font-medium">
                          <div className="flex justify-between items-center"><span className="text-slate-400">Correctness</span> <span className="bg-slate-900 px-2 py-0.5 rounded text-emerald-400">{ev.scores?.correctness?.score || 0}/10</span></div>
                          <div className="flex justify-between items-center"><span className="text-slate-400">Hallucination Safety</span> <span className="bg-slate-900 px-2 py-0.5 rounded text-emerald-400">{ev.scores?.hallucinationResistance?.score || 0}/10</span></div>
                          <div className="flex justify-between items-center"><span className="text-slate-400">Tool Efficiency</span> <span className="bg-slate-900 px-2 py-0.5 rounded text-blue-400">{ev.scores?.toolEfficiency?.score || 0}/10</span></div>
                          <div className="flex justify-between items-center"><span className="text-slate-400">Synthesis Safety</span> <span className="bg-slate-900 px-2 py-0.5 rounded text-purple-400">{ev.scores?.synthesisSafety?.score || 0}/10</span></div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {activeTab === 'hallucinations' && (
              <div className="flex flex-col gap-3 sm:gap-4">
                {hallucinations.length === 0 ? <div className="text-center text-slate-600 text-xs sm:text-sm mt-10 flex flex-col items-center gap-2"><CheckCircle className="text-emerald-500/50" size={28}/><p>System completely safe. Zero policy violations.</p></div> :
                  hallucinations.map((item, idx) => {
                    const isObject = typeof item === 'object' && item !== null;
                    const claimText = isObject ? item.claim : item;
                    const reasonText = isObject ? item.reason : "Unverified claim flagged or suppressed";
                    const confidence = isObject ? item.confidence : null;
                    const suppressed = isObject ? item.suppressed : true;
                    
                    return (
                      <div key={idx} className="p-4 bg-red-950/20 border border-red-500/15 rounded-2xl flex items-start gap-4 shadow-lg">
                        <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={20} />
                        <div className="flex-1 min-w-0">
                           <div className="flex flex-wrap items-center gap-2 mb-1.5">
                             <span className="text-red-200 font-bold text-xs sm:text-sm truncate">Claim: {claimText}</span>
                             <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${suppressed ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                               {suppressed ? 'SUPPRESSED' : 'FLAGGED'}
                             </span>
                           </div>
                           <p className="text-xs text-slate-400 leading-relaxed font-medium">Reason: {reasonText}</p>
                           {confidence !== null && (
                             <div className="mt-2 text-[10px] font-mono text-slate-500">
                               Confidence Score: <span className="font-bold text-red-400">{confidence}</span>
                             </div>
                           )}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
