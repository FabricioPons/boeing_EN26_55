import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plane, AlertTriangle, CheckCircle, Radio, Clock, ArrowLeft, FileText, Download, Cable, Unplug, Users, Link2, Check } from 'lucide-react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

const SOCKET_URL = process.env.NODE_ENV === 'production'
  ? '' : `http://${window.location.hostname}:3001`;

const playAlertBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
};

const LockDetectionSystem = () => {
  const positionLayouts = {
    sideBySide: {
      name: 'Side by Side (L/R)',
      positions: [
        ['AR', 'BR', 'CR', 'DR', 'ER', 'FR', 'GR', 'HR', 'JR', 'KR', 'LR', 'MR', 'NR', 'PR'],
        ['AL', 'BL', 'CL', 'DL', 'EL', 'FL', 'GL', 'HL', 'JL', 'KL', 'LL', 'ML', 'NL', 'PL']
      ],
      gridCols: 14,
      description: 'Left and Right side positions for PMC/PAG pallets'
    },
    centerLoad: {
      name: 'Center Load',
      positions: [
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P']
      ],
      gridCols: 14,
      description: 'Single center positions for PMC pallets'
    },
    lowerDeck: {
      name: 'Lower Deck',
      positions: [
        ['AR', 'BR', 'CDR', 'EF', 'GH', 'JK', 'LMR', 'NPR'],
        ['AL', 'BL', 'CDL', '', '', '', 'LML', 'NPL']
      ],
      gridCols: 8,
      description: 'Lower deck positions for PRA/PGA containers'
    }
  };

  const [currentView, setCurrentView] = useState('configuration');
  const [selectedLayout, setSelectedLayout] = useState(null);
  const [uldStatuses, setUldStatuses] = useState({});
  const [selectedULD, setSelectedULD] = useState(null);
  const [flightLog, setFlightLog] = useState([]);
  const [flightStartTime, setFlightStartTime] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastSensorData, setLastSensorData] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [baudRate, setBaudRate] = useState('115200');

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readableStreamClosedRef = useRef(null);
  const lockPositions = ['Forward Left', 'Forward Right', 'Aft Left', 'Aft Right'];
  const previousStatesRef = useRef({});
  const socketRef = useRef(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [viewerURL, setViewerURL] = useState(`${window.location.origin}?mode=viewer`);
  const [socketConnected, setSocketConnected] = useState(false);

  // Connect to relay server for ground operator broadcasting
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('register-master');
      setSocketConnected(true);
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('viewer-count', (count) => setViewerCount(count));
    socket.on('server-info', ({ ip, port }) => {
      const p = window.location.port ? `:${window.location.port}` : '';
      setViewerURL(`http://${ip}${p}?mode=viewer`);
    });
    return () => socket.disconnect();
  }, []);

  // Broadcast state to ground operators
  useEffect(() => {
    if (!socketConnected || !selectedLayout) return;
    const serializedStatuses = {};
    for (const [key, value] of Object.entries(uldStatuses)) {
      serializedStatuses[key] = {
        ...value,
        locks: value.locks.map(lock => ({
          ...lock,
          lastCheck: lock.lastCheck instanceof Date ? lock.lastCheck.toISOString() : lock.lastCheck
        }))
      };
    }
    socketRef.current.emit('state-update', {
      selectedLayout,
      layoutConfig: positionLayouts[selectedLayout],
      uldStatuses: serializedStatuses,
      flightLog: flightLog.map(l => ({
        ...l,
        timestamp: l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp
      })),
      flightStartTime: flightStartTime instanceof Date ? flightStartTime.toISOString() : flightStartTime,
      connectionStatus,
      lastSensorData,
    });
  }, [socketConnected, uldStatuses, flightLog, connectionStatus, lastSensorData, selectedLayout, flightStartTime]);

  const copyViewerLink = () => {
    navigator.clipboard.writeText(viewerURL).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const initializeULDs = (layout) => {
    const initialStatuses = {};
    positionLayouts[layout].positions.forEach(row => {
      row.forEach(pos => {
        if (pos) {
          initialStatuses[pos] = {
            locks: [
              { position: 'Forward Left',  engaged: true, lastCheck: new Date() },
              { position: 'Forward Right', engaged: true, lastCheck: new Date() },
              { position: 'Aft Left',      engaged: true, lastCheck: new Date() },
              { position: 'Aft Right',     engaged: true, lastCheck: new Date() }
            ],
            overallStatus: 'engaged'
          };
        }
      });
    });
    setUldStatuses(initialStatuses);
  };

  const startMonitoring = (layout) => {
    setSelectedLayout(layout);
    initializeULDs(layout);
    setFlightStartTime(new Date());
    setCurrentView('monitoring');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'engaged':    return { bg: '#10B981', border: '#059669', text: '#065F46' };
      case 'partial':    return { bg: '#F59E0B', border: '#D97706', text: '#92400E' };
      case 'disengaged': return { bg: '#EF4444', border: '#DC2626', text: '#991B1B' };
      default:           return { bg: '#6B7280', border: '#4B5563', text: '#1F2937' };
    }
  };

  const processSensorData = useCallback((data) => {
    const { uldPosition, lockIndex, engaged } = data;
    const basePosition = uldPosition.replace(/[LR]$/, '');
    const stateKey = `${uldPosition}-${lockIndex}`;
    const previousState = previousStatesRef.current[stateKey];
    const isStateChange = previousState === undefined || previousState !== engaged;
    previousStatesRef.current[stateKey] = engaged;

    setLastSensorData(data);

    if (isStateChange) {
      if (!engaged) playAlertBeep();
      setFlightLog(prevLog => [...prevLog, {
        timestamp: new Date(),
        uldPosition,
        lockPosition: lockPositions[lockIndex],
        event: engaged ? 'ENGAGED' : 'DISENGAGED',
        value: engaged ? 1 : 0
      }]);
    }

    setUldStatuses(prevStatuses => {
      const updated = { ...prevStatuses };
      let targetULD = updated[uldPosition] || updated[basePosition];
      if (targetULD) {
        targetULD.locks[lockIndex] = { ...targetULD.locks[lockIndex], engaged, lastCheck: new Date() };
        const engagedCount = targetULD.locks.filter(l => l.engaged).length;
        targetULD.overallStatus = engagedCount === 4 ? 'engaged' : engagedCount === 0 ? 'disengaged' : 'partial';
      }
      return updated;
    });
  }, []);

  const connectToArduino = useCallback(async () => {
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
      setConnectionStatus('connected');

      const decoder = new TextDecoderStream();
      readableStreamClosedRef.current = port.readable.pipeTo(decoder.writable);
      readerRef.current = decoder.readable.getReader();
      let buffer = '';

      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await readerRef.current.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try { processSensorData(JSON.parse(trimmed)); } catch (e) {}
              }
            }
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            setConnectionError(`Read error: ${error.message}`);
            setConnectionStatus('error');
          }
        }
      };
      readLoop();
    } catch (error) {
      setConnectionError(error.name === 'NotFoundError' ? 'No port selected. Please try again.' : `Failed to connect: ${error.message}`);
      setConnectionStatus('error');
    }
  }, [baudRate, processSensorData]);

  const disconnectFromArduino = useCallback(async () => {
    try {
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
      if (readableStreamClosedRef.current) { await readableStreamClosedRef.current.catch(() => {}); readableStreamClosedRef.current = null; }
      if (portRef.current) { await portRef.current.close(); portRef.current = null; }
    } catch (e) {}
    setConnectionStatus('disconnected');
    setLastSensorData(null);
  }, []);

  const ConfigurationView = () => (
    <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-8 mb-6 border border-gray-100 dark:border-slate-700">
          <div className="flex items-center space-x-3 mb-2">
            <Plane className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Boeing 777F Lock Detection System</h1>
              <p className="text-gray-500 dark:text-slate-400">USB Serial Connection — Select Aircraft Configuration</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-400 dark:text-slate-500 mt-3">
            <Cable className="h-4 w-4" />
            <span>Wired USB connection to Arduino Uno Wi-Fi Rev4</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(positionLayouts).map(([key, config]) => (
            <div
              key={key}
              onClick={() => startMonitoring(key)}
              className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border-2 border-gray-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200"
            >
              <h3 className="font-bold text-lg text-gray-900 dark:text-slate-100 mb-2">{config.name}</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">{config.description}</p>
              <div className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                {config.positions.flat().filter(p => p).length} positions
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const MonitoringView = () => {
    const layout = positionLayouts[selectedLayout];
    const activeAlerts = Object.entries(uldStatuses).filter(([_, status]) => status.overallStatus !== 'engaged');

    return (
      <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => { disconnectFromArduino(); setCurrentView('configuration'); }} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Lock Status Monitor</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">{layout.name} — USB Serial</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'  ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  connectionStatus === 'error'      ? 'bg-red-500' : 'bg-gray-400 dark:bg-slate-500'
                }`}></div>
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {connectionStatus === 'connected' ? 'USB Connected' :
                   connectionStatus === 'connecting' ? 'Connecting...' :
                   connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
                </span>
              </div>
              <button onClick={() => setCurrentView('report')} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                <FileText className="h-4 w-4" /><span>Flight Report</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />Active Alerts
                </h2>
                {activeAlerts.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-slate-400">All Locks Secured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeAlerts.map(([position, status]) => (
                      <div
                        key={position}
                        className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 animate-pulse-alert transition-colors"
                        onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
                      >
                        <div className="font-semibold text-red-900 dark:text-red-300">ULD {position}</div>
                        <div className="text-sm text-red-700 dark:text-red-400">
                          {status.overallStatus === 'partial' ? 'Partial Lock Failure' : 'All Locks Disengaged'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* USB Connection Panel */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center">
                  {connectionStatus === 'connected'
                    ? <Cable className="h-4 w-4 mr-2 text-green-500" />
                    : <Unplug className="h-4 w-4 mr-2 text-gray-400 dark:text-slate-500" />}
                  USB Serial Connection
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Baud Rate</label>
                    <select
                      value={baudRate}
                      onChange={(e) => setBaudRate(e.target.value)}
                      disabled={connectionStatus === 'connected'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    >
                      <option value="9600">9600</option>
                      <option value="19200">19200</option>
                      <option value="38400">38400</option>
                      <option value="57600">57600</option>
                      <option value="115200">115200</option>
                    </select>
                  </div>
                  {connectionError && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-200 dark:border-red-800">
                      {connectionError}
                    </div>
                  )}
                  {!('serial' in navigator) && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                      Web Serial API not supported. Use Chrome, Edge, or Opera.
                    </div>
                  )}
                  {connectionStatus === 'connected' ? (
                    <button onClick={disconnectFromArduino} className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-colors">
                      <Unplug className="h-4 w-4" /><span>Disconnect</span>
                    </button>
                  ) : (
                    <button onClick={connectToArduino} disabled={connectionStatus === 'connecting' || !('serial' in navigator)} className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center space-x-2 disabled:opacity-60 transition-colors">
                      <Cable className="h-4 w-4" /><span>{connectionStatus === 'connecting' ? 'Connecting...' : 'Connect USB'}</span>
                    </button>
                  )}
                  {lastSensorData && (
                    <div className="mt-2 p-2 bg-gray-50 dark:bg-slate-700 rounded-lg text-xs text-gray-600 dark:text-slate-300">
                      <div className="font-semibold mb-1">Last Sensor Data:</div>
                      ULD: {lastSensorData.uldPosition} | Lock: {lockPositions[lastSensorData.lockIndex]} | {lastSensorData.engaged ? 'Engaged' : 'Disengaged'}
                    </div>
                  )}
                </div>
              </div>

              {/* Ground Operator Access */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center">
                  <Users className="h-4 w-4 mr-2 text-blue-500" />
                  Ground Operator Access
                  {viewerCount > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-center p-3 bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
                    <QRCodeSVG value={viewerURL} size={140} level="M" />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
                    Scan to view live dashboard
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-2 py-1.5 bg-gray-50 dark:bg-slate-700 rounded text-xs text-gray-600 dark:text-slate-300 truncate border border-gray-200 dark:border-slate-600 select-all">
                      {viewerURL}
                    </div>
                    <button
                      onClick={copyViewerLink}
                      className="shrink-0 p-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      title="Copy link"
                    >
                      {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {linkCopied && (
                    <p className="text-xs text-green-600 dark:text-green-400 text-center">Link copied!</p>
                  )}
                  {!socketConnected && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                      Relay server not connected. Run: node server.js
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Cargo Deck Status</h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-slate-400">
                    <div className="flex items-center space-x-1.5"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#10B981' }}></div><span>Engaged</span></div>
                    <div className="flex items-center space-x-1.5"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#F59E0B' }}></div><span>Partial</span></div>
                    <div className="flex items-center space-x-1.5"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#EF4444' }}></div><span>Disengaged</span></div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 pointer-events-none opacity-5 dark:opacity-10">
                    <svg className="w-full h-full" viewBox="0 0 800 200">
                      <path d="M 50 100 Q 50 70 80 70 L 720 70 Q 750 70 750 100 Q 750 130 720 130 L 80 130 Q 50 130 50 100 Z" stroke="#374151" strokeWidth="3" fill="none" />
                    </svg>
                  </div>
                  <div className="relative z-10 space-y-3 p-4">
                    {layout.positions.map((row, rowIndex) => (
                      <div key={`row-${rowIndex}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${layout.gridCols}, 1fr)` }}>
                        {row.map((position, colIndex) => {
                          if (!position) return <div key={`empty-${colIndex}`} className="min-h-20"></div>;
                          const status = uldStatuses[position];
                          if (!status) return null;
                          const colors = getStatusColor(status.overallStatus);
                          const hasSensor = lastSensorData && position === lastSensorData.uldPosition;
                          const isAlert = status.overallStatus !== 'engaged';
                          return (
                            <div
                              key={position}
                              className={`relative border-2 rounded-lg p-3 min-h-20 flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-lg ${isAlert ? 'animate-pulse-alert' : ''}`}
                              style={{ backgroundColor: colors.bg + '20', borderColor: colors.border }}
                              onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
                            >
                              {hasSensor && <div className="absolute top-1 right-1"><Radio className="h-3 w-3 text-blue-600 dark:text-blue-400" /></div>}
                              <div className="font-bold text-base" style={{ color: colors.text }}>{position}</div>
                              <div className="flex items-center mt-1">
                                {status.overallStatus === 'engaged'
                                  ? <CheckCircle className="h-4 w-4" style={{ color: colors.border }} />
                                  : <AlertTriangle className="h-4 w-4" style={{ color: colors.border }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-between text-sm text-gray-400 dark:text-slate-500 px-4">
                    <span>AFT</span><span>FORWARD</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DetailView = () => {
    const status = uldStatuses[selectedULD];
    if (!status) return null;
    return (
      <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center space-x-4">
            <button onClick={() => setCurrentView('monitoring')} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">ULD {selectedULD} — Lock Details</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">Individual Lock Status</p>
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <div className="grid grid-cols-2 gap-6">
              {status.locks.map((lock, index) => {
                const isActiveSensor = lastSensorData && selectedULD === lastSensorData.uldPosition && index === lastSensorData.lockIndex;
                const colors = getStatusColor(lock.engaged ? 'engaged' : 'disengaged');
                return (
                  <div
                    key={index}
                    className={`p-6 rounded-xl border-2 transition-all ${isActiveSensor ? 'ring-4 ring-blue-400 dark:ring-blue-500' : ''} ${!lock.engaged ? 'animate-pulse-alert' : ''}`}
                    style={{ backgroundColor: colors.bg + '15', borderColor: colors.border }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-slate-100">{lock.position}</h3>
                      {isActiveSensor && <div className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 text-sm font-medium"><Radio className="h-4 w-4" /><span>Sensor</span></div>}
                    </div>
                    <div className="flex items-center space-x-3 mb-4">
                      {lock.engaged ? <CheckCircle className="h-8 w-8" style={{ color: colors.border }} /> : <AlertTriangle className="h-8 w-8" style={{ color: colors.border }} />}
                      <div>
                        <div className="font-semibold text-xl" style={{ color: colors.text }}>{lock.engaged ? 'ENGAGED' : 'DISENGAGED'}</div>
                        <div className="text-sm text-gray-500 dark:text-slate-400">Status: {lock.engaged ? '1' : '0'}</div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                      <div className="flex items-center text-sm text-gray-500 dark:text-slate-400">
                        <Clock className="h-4 w-4 mr-2" />Last Check: {lock.lastCheck.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const exportReport = () => {
    const engagementCount = flightLog.filter(l => l.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(l => l.event === 'DISENGAGED').length;
    const d = flightStartTime ? new Date() - flightStartTime : 0;
    const hours = Math.floor(d / 3600000), minutes = Math.floor((d % 3600000) / 60000), seconds = Math.floor((d % 60000) / 1000);
    let csv = `Boeing 777F Lock Detection System - Flight Report (USB Serial)\nGenerated: ${new Date().toLocaleString()}\nConfiguration: ${positionLayouts[selectedLayout].name}\nFlight Duration: ${hours}h ${minutes}m ${seconds}s\nTotal Events: ${flightLog.length}\nEngagements: ${engagementCount}\nDisengagements: ${disengagementCount}\n\nTimestamp,ULD Position,Lock Position,Event,Value\n`;
    flightLog.forEach(l => { csv += `"${l.timestamp.toLocaleString()}",${l.uldPosition},${l.lockPosition},${l.event},${l.value}\n`; });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
    link.setAttribute('download', `Boeing777F_USB_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const ReportView = () => {
    const engagementCount = flightLog.filter(l => l.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(l => l.event === 'DISENGAGED').length;
    const d = flightStartTime ? new Date() - flightStartTime : 0;
    const hours = Math.floor(d / 3600000), minutes = Math.floor((d % 3600000) / 60000);
    return (
      <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setCurrentView('monitoring')} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"><ArrowLeft className="h-6 w-6" /></button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Flight Report</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">Lock Engagement History (USB Serial)</p>
              </div>
            </div>
            <button onClick={exportReport} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              <Download className="h-4 w-4" /><span>Export CSV</span>
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Flight Duration', value: `${hours}h ${minutes}m`, color: 'text-gray-900 dark:text-slate-100' },
              { label: 'Total Events',    value: flightLog.length,        color: 'text-gray-900 dark:text-slate-100' },
              { label: 'Engagements',     value: engagementCount,         color: 'text-green-600 dark:text-green-400' },
              { label: 'Disengagements',  value: disengagementCount,      color: 'text-red-600 dark:text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">{label}</div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Event Timeline</h2>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0">
                  <tr>{['Timestamp', 'ULD Position', 'Lock Position', 'Event', 'Value'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {flightLog.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400 dark:text-slate-500">No events recorded</td></tr>
                  ) : (
                    flightLog.slice().reverse().map((log, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-slate-200">{log.timestamp.toLocaleTimeString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">{log.uldPosition}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">{log.lockPosition}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${log.event === 'ENGAGED' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{log.event}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-slate-200">{log.value}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {currentView === 'configuration' && <ConfigurationView />}
      {currentView === 'monitoring'    && <MonitoringView />}
      {currentView === 'detail'        && <DetailView />}
      {currentView === 'report'        && <ReportView />}
    </>
  );
};

export default LockDetectionSystem;
