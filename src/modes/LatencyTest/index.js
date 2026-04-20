import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Gauge, Cable, Unplug, Play, Activity } from 'lucide-react';
import { computeStats } from './stats';
import { fitClock, localAtArduino } from './timesync';

const SAMPLE_CAP = 200;
const OFFSET_CAP = 20;
const PING_INTERVAL_MS = 500;   // Faster pings → smaller drift window + more fit data
const PING_WARMUP_COUNT = 10;
const PING_WARMUP_SPACING_MS = 50;
const BURST_IDLE_TIMEOUT_MS = 3000;

const LatencyTestMode = () => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [baudRate, setBaudRate] = useState('115200');

  const [offsetMs, setOffsetMs] = useState(null);
  const [skew, setSkew] = useState(null);
  const [lastRttMs, setLastRttMs] = useState(null);
  const [samples, setSamples] = useState([]);

  const [burstTarget, setBurstTarget] = useState(50);
  const [burstIntervalMs, setBurstIntervalMs] = useState(100);
  const [burst, setBurst] = useState({ running: false, target: 0, received: 0, samples: [] });

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const writerRef = useRef(null);
  const readableStreamClosedRef = useRef(null);
  const writableStreamClosedRef = useRef(null);

  const pingIdRef = useRef(0);
  const pendingPingsRef = useRef(new Map());
  const fitSamplesRef = useRef([]);
  const fitRef = useRef(null);
  const pingTimerRef = useRef(null);

  const burstRef = useRef({ running: false, target: 0, received: 0, samples: [], idleTimer: null });

  const stats = computeStats(samples);
  const burstStats = computeStats(burst.samples);

  const writeLine = useCallback(async (line) => {
    if (!writerRef.current) return;
    try {
      await writerRef.current.write(line + '\n');
    } catch (e) {
      // Write failures surface via the reader's error path; no-op here.
    }
  }, []);

  const sendPing = useCallback(() => {
    const id = ++pingIdRef.current;
    const sendLocal = performance.now();
    pendingPingsRef.current.set(id, sendLocal);
    writeLine(`PING ${id}`);
  }, [writeLine]);

  const recomputeFit = useCallback(() => {
    const arr = fitSamplesRef.current;
    if (arr.length === 0) return;
    const fit = fitClock(arr);
    fitRef.current = fit;
    setOffsetMs(fit.offset);
    setSkew(fit.skew);
    setLastRttMs(arr[arr.length - 1].rtt);
  }, []);

  const handlePong = useCallback((msg) => {
    const id = msg.pong;
    const sendLocal = pendingPingsRef.current.get(id);
    if (sendLocal === undefined) return;
    pendingPingsRef.current.delete(id);
    const receiveLocal = performance.now();
    const rtt = receiveLocal - sendLocal;
    const localMid = (sendLocal + receiveLocal) / 2;
    const arr = fitSamplesRef.current;
    arr.push({ rtt, localMid, arduinoT: msg.t });
    if (arr.length > OFFSET_CAP) arr.shift();
    recomputeFit();
  }, [recomputeFit]);

  const clearBurstIdleTimer = () => {
    if (burstRef.current.idleTimer) {
      clearTimeout(burstRef.current.idleTimer);
      burstRef.current.idleTimer = null;
    }
  };

  const finishBurst = useCallback(() => {
    clearBurstIdleTimer();
    if (!burstRef.current.running) return;
    burstRef.current.running = false;
    setBurst({
      running: false,
      target: burstRef.current.target,
      received: burstRef.current.received,
      samples: burstRef.current.samples.slice(),
    });
  }, []);

  const armBurstIdleTimer = useCallback(() => {
    clearBurstIdleTimer();
    burstRef.current.idleTimer = setTimeout(() => {
      finishBurst();
    }, BURST_IDLE_TIMEOUT_MS);
  }, [finishBurst]);

  const handleSensorEvent = useCallback((msg) => {
    const fit = fitRef.current;
    if (!fit) return;  // Ignore until clock sync lands
    if (typeof msg.t !== 'number') return;
    const receiveLocal = performance.now();
    const eventLocal = localAtArduino(fit, msg.t);
    const latencyMs = receiveLocal - eventLocal;

    setSamples((prev) => {
      const next = prev.length >= SAMPLE_CAP ? prev.slice(prev.length - SAMPLE_CAP + 1) : prev.slice();
      next.push(latencyMs);
      return next;
    });

    if (burstRef.current.running) {
      burstRef.current.received += 1;
      burstRef.current.samples.push(latencyMs);
      setBurst({
        running: true,
        target: burstRef.current.target,
        received: burstRef.current.received,
        samples: burstRef.current.samples.slice(),
      });
      if (burstRef.current.received >= burstRef.current.target) {
        finishBurst();
      } else {
        armBurstIdleTimer();
      }
    }
  }, [finishBurst, armBurstIdleTimer]);

  const handleLine = useCallback((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch (e) { return; }
    if (typeof msg.pong === 'number') {
      handlePong(msg);
    } else if (typeof msg.engaged === 'boolean' && typeof msg.t === 'number') {
      handleSensorEvent(msg);
    }
  }, [handlePong, handleSensorEvent]);

  const connect = useCallback(async () => {
    if (!('serial' in navigator)) {
      setConnectionError('Web Serial API not supported. Use Chrome, Edge, or Opera.');
      setConnectionStatus('error');
      return;
    }
    setConnectionStatus('connecting');
    setConnectionError('');
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: parseInt(baudRate) });
      portRef.current = port;

      const decoder = new TextDecoderStream();
      readableStreamClosedRef.current = port.readable.pipeTo(decoder.writable);
      readerRef.current = decoder.readable.getReader();

      const encoder = new TextEncoderStream();
      writableStreamClosedRef.current = encoder.readable.pipeTo(port.writable);
      writerRef.current = encoder.writable.getWriter();

      setConnectionStatus('connected');

      let buffer = '';
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await readerRef.current.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) handleLine(line);
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            setConnectionError(`Read error: ${error.message}`);
            setConnectionStatus('error');
          }
        }
      };
      readLoop();

      // Clock-sync warmup: a rapid burst of PINGs, then a steady heartbeat.
      for (let i = 0; i < PING_WARMUP_COUNT; i++) {
        setTimeout(() => sendPing(), i * PING_WARMUP_SPACING_MS);
      }
      pingTimerRef.current = setInterval(() => sendPing(), PING_INTERVAL_MS);
    } catch (error) {
      setConnectionError(error.name === 'NotFoundError'
        ? 'No port selected. Please try again.'
        : `Failed to connect: ${error.message}`);
      setConnectionStatus('error');
    }
  }, [baudRate, handleLine, sendPing]);

  const disconnect = useCallback(async () => {
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    clearBurstIdleTimer();
    burstRef.current.running = false;
    try {
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
      if (readableStreamClosedRef.current) { await readableStreamClosedRef.current.catch(() => {}); readableStreamClosedRef.current = null; }
      if (writerRef.current) { await writerRef.current.close().catch(() => {}); writerRef.current = null; }
      if (writableStreamClosedRef.current) { await writableStreamClosedRef.current.catch(() => {}); writableStreamClosedRef.current = null; }
      if (portRef.current) { await portRef.current.close(); portRef.current = null; }
    } catch (e) {}
    setConnectionStatus('disconnected');
    setOffsetMs(null);
    setSkew(null);
    setLastRttMs(null);
    pendingPingsRef.current.clear();
    fitSamplesRef.current = [];
    fitRef.current = null;
  }, []);

  useEffect(() => () => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    clearBurstIdleTimer();
  }, []);

  const runBurst = useCallback(() => {
    if (connectionStatus !== 'connected') return;
    if (!fitRef.current) return;
    const n = Math.max(1, Math.min(500, parseInt(burstTarget, 10) || 0));
    const iv = Math.max(10, Math.min(5000, parseInt(burstIntervalMs, 10) || 0));
    burstRef.current = { running: true, target: n, received: 0, samples: [], idleTimer: null };
    setBurst({ running: true, target: n, received: 0, samples: [] });
    writeLine(`BURST ${n} ${iv}`);
    armBurstIdleTimer();
  }, [connectionStatus, burstTarget, burstIntervalMs, writeLine, armBurstIdleTimer]);

  const clearSamples = () => setSamples([]);

  const latencyColor = (ms) => {
    if (ms === null || ms === undefined) return '#6b7280';
    if (ms < 50) return '#22c55e';
    if (ms < 150) return '#fbbf24';
    return '#ef4444';
  };

  const fmt = (v, digits = 1) => (v === null || v === undefined ? '—' : v.toFixed(digits));

  const statusPill = () => {
    const map = {
      disconnected: { label: 'DISCONNECTED', color: '#6b7280' },
      connecting:   { label: 'CONNECTING',   color: '#fbbf24' },
      connected:    { label: 'CONNECTED',    color: '#22c55e' },
      error:        { label: 'ERROR',        color: '#ef4444' },
    };
    const s = map[connectionStatus] || map.disconnected;
    return (
      <span
        className="inline-flex items-center px-2 py-1 rounded text-xs font-bold tracking-wider border"
        style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}11` }}
      >
        {s.label}
      </span>
    );
  };

  const maxSparkVal = Math.max(1, ...samples);

  return (
    <div className="animate-fadeIn min-h-screen bg-[#0a0f1a] p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="avion-panel mb-6">
          <div className="avion-panel-header">LATENCY TEST · ARDUINO → UI</div>
          <div className="p-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#1e3a5f] rounded flex items-center justify-center">
                <Gauge className="h-6 w-6 text-[#00d4ff]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-wide">SIGNAL → UI DELAY MEASUREMENT</h1>
                <p className="text-[#6b7280] text-sm tracking-wider">
                  NTP-STYLE CLOCK SYNC · ARDUINO-TAGGED EVENT TIMESTAMPS
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {statusPill()}
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(e.target.value)}
                disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}
                className="bg-[#0a0f1a] border border-[#1e3a5f] text-[#00d4ff] text-xs font-bold px-3 py-2 rounded tracking-wider"
              >
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
              </select>
              {connectionStatus === 'connected' ? (
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] text-white text-xs font-bold px-4 py-2 rounded tracking-wider transition-colors"
                >
                  <Unplug className="h-4 w-4" />
                  DISCONNECT
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={connectionStatus === 'connecting'}
                  className="flex items-center gap-2 bg-[#00d4ff] hover:bg-[#00bde0] disabled:opacity-50 text-[#0a0f1a] text-xs font-bold px-4 py-2 rounded tracking-wider transition-colors"
                >
                  <Cable className="h-4 w-4" />
                  CONNECT
                </button>
              )}
            </div>
          </div>
          {connectionError && (
            <div className="px-6 pb-4 text-xs text-[#ef4444] tracking-wider">{connectionError}</div>
          )}
        </div>

        {/* Last reading + stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="avion-panel md:col-span-1">
            <div className="avion-panel-header">LAST SAMPLE</div>
            <div className="p-6 flex flex-col items-center justify-center">
              <div
                className="text-6xl font-bold tracking-tight"
                style={{ color: latencyColor(stats.last) }}
              >
                {fmt(stats.last, 1)}
              </div>
              <div className="text-[#6b7280] text-xs tracking-wider mt-2">MILLISECONDS</div>
            </div>
          </div>

          <div className="avion-panel md:col-span-2">
            <div className="avion-panel-header">ROLLING STATS (LAST {SAMPLE_CAP})</div>
            <div className="p-6 grid grid-cols-3 sm:grid-cols-6 gap-4">
              <StatCell label="AVG" value={fmt(stats.avg, 1)} />
              <StatCell label="MIN" value={fmt(stats.min, 1)} />
              <StatCell label="MAX" value={fmt(stats.max, 1)} />
              <StatCell label="P50" value={fmt(stats.p50, 1)} />
              <StatCell label="P95" value={fmt(stats.p95, 1)} />
              <StatCell label="N" value={String(stats.n)} />
            </div>
            <div className="px-6 pb-4 flex items-center justify-between text-xs tracking-wider text-[#6b7280]">
              <span>
                OFFSET: {fmt(offsetMs, 1)} ms · SKEW: {skew === null ? '—' : skew.toFixed(6)} · LAST RTT: {fmt(lastRttMs, 1)} ms
              </span>
              <button
                onClick={clearSamples}
                className="text-[#00d4ff] hover:text-white tracking-wider"
              >
                CLEAR
              </button>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="avion-panel mb-6">
          <div className="avion-panel-header flex items-center gap-2">
            <Activity className="h-3 w-3" /> RECENT SAMPLES
          </div>
          <div className="p-6">
            {samples.length === 0 ? (
              <div className="text-[#6b7280] text-xs tracking-wider text-center py-6">
                NO SAMPLES YET · CONNECT AND TRIGGER AN EVENT
              </div>
            ) : (
              <div className="flex items-end gap-[2px] h-24">
                {samples.map((v, i) => (
                  <div
                    key={i}
                    title={`${v.toFixed(1)} ms`}
                    className="flex-1"
                    style={{
                      height: `${Math.max(2, (v / maxSparkVal) * 100)}%`,
                      background: latencyColor(v),
                      opacity: 0.85,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Burst test */}
        <div className="avion-panel mb-6">
          <div className="avion-panel-header">AUTOMATED BURST TEST</div>
          <div className="p-6 flex flex-wrap items-end gap-4">
            <FieldNumber
              label="SAMPLES"
              value={burstTarget}
              onChange={setBurstTarget}
              min={1}
              max={500}
              disabled={burst.running}
            />
            <FieldNumber
              label="INTERVAL (MS)"
              value={burstIntervalMs}
              onChange={setBurstIntervalMs}
              min={10}
              max={5000}
              disabled={burst.running}
            />
            <button
              onClick={runBurst}
              disabled={connectionStatus !== 'connected' || offsetMs === null || burst.running}
              className="flex items-center gap-2 bg-[#00d4ff] hover:bg-[#00bde0] disabled:opacity-40 disabled:cursor-not-allowed text-[#0a0f1a] text-xs font-bold px-4 py-2 rounded tracking-wider transition-colors"
            >
              <Play className="h-4 w-4" />
              {burst.running ? 'RUNNING…' : 'RUN BURST TEST'}
            </button>
            {offsetMs === null && connectionStatus === 'connected' && (
              <span className="text-[#fbbf24] text-xs tracking-wider">WAITING FOR CLOCK SYNC…</span>
            )}
          </div>

          {(burst.running || burst.samples.length > 0) && (
            <div className="px-6 pb-6">
              <div className="text-xs tracking-wider text-[#6b7280] mb-2">
                {burst.running ? 'IN PROGRESS' : 'COMPLETED'} · RECEIVED {burst.received}/{burst.target}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                <StatCell label="AVG" value={fmt(burstStats.avg, 1)} />
                <StatCell label="MIN" value={fmt(burstStats.min, 1)} />
                <StatCell label="MAX" value={fmt(burstStats.max, 1)} />
                <StatCell label="P50" value={fmt(burstStats.p50, 1)} />
                <StatCell label="P95" value={fmt(burstStats.p95, 1)} />
                <StatCell label="N" value={String(burstStats.n)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCell = ({ label, value }) => (
  <div className="bg-[#0a0f1a] border border-[#1e3a5f] rounded px-3 py-3">
    <div className="text-[10px] text-[#6b7280] tracking-wider mb-1">{label}</div>
    <div className="text-xl text-white font-bold tracking-tight">{value}</div>
  </div>
);

const FieldNumber = ({ label, value, onChange, min, max, disabled }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[10px] text-[#6b7280] tracking-wider">{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0a0f1a] border border-[#1e3a5f] text-white text-sm font-bold px-3 py-2 rounded w-28 disabled:opacity-50"
    />
  </label>
);

export default LatencyTestMode;
