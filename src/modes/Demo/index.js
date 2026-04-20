import React, { useState, useEffect, useRef } from 'react';
import { Plane, AlertTriangle, CheckCircle, Radio, Clock, ArrowLeft, FileText, Download, Users, Link2, Check } from 'lucide-react';
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

const positionLayouts = {
  sideBySide: {
    name: 'SIDE BY SIDE (L/R)',
    positions: [
      ['AR', 'BR', 'CR', 'DR', 'ER', 'FR', 'GR', 'HR', 'JR', 'KR', 'LR', 'MR', 'NR', 'PR'],
      ['AL', 'BL', 'CL', 'DL', 'EL', 'FL', 'GL', 'HL', 'JL', 'KL', 'LL', 'ML', 'NL', 'PL']
    ],
    gridCols: 14,
    description: 'Left and Right side positions for PMC/PAG pallets'
  },
  centerLoad: {
    name: 'CENTER LOAD',
    positions: [
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P']
    ],
    gridCols: 14,
    description: 'Single center positions for PMC pallets'
  },
  lowerDeck: {
    name: 'LOWER DECK',
    positions: [
      ['AR', 'BR', 'CDR', 'EF', 'GH', 'JK', 'LMR', 'NPR'],
      ['AL', 'BL', 'CDL', '', '', '', 'LML', 'NPL']
    ],
    gridCols: 8,
    description: 'Lower deck positions for PRA/PGA containers'
  }
};

const lockPositions = ['Forward Left', 'Forward Right', 'Aft Left', 'Aft Right'];

const LockDetectionSystem = () => {
  const [currentView, setCurrentView] = useState('configuration');
  const [selectedLayout, setSelectedLayout] = useState(null);
  const [uldStatuses, setUldStatuses] = useState({});
  const [selectedULD, setSelectedULD] = useState(null);
  const [flightLog, setFlightLog] = useState([]);
  const [flightStartTime, setFlightStartTime] = useState(null);
  const [sensorConnected, setSensorConnected] = useState(false);
  const [sensorState, setSensorState] = useState({
    uldPosition: 'AR',
    lockIndex: 0,
    engaged: true
  });

  // Socket.io state for web sharing
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
      connectionStatus: sensorConnected ? 'connected' : 'disconnected',
      lastSensorData: sensorState,
    });
  }, [socketConnected, uldStatuses, flightLog, sensorConnected, sensorState, selectedLayout, flightStartTime]);

  const copyViewerLink = () => {
    navigator.clipboard.writeText(viewerURL).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const initializeULDs = (layout) => {
    const initialStatuses = {};
    const positions = positionLayouts[layout].positions;
    positions.forEach(row => {
      row.forEach(pos => {
        if (pos) {
          initialStatuses[pos] = {
            locks: [
              { position: 'Forward Left', engaged: true, lastCheck: new Date() },
              { position: 'Forward Right', engaged: true, lastCheck: new Date() },
              { position: 'Aft Left', engaged: true, lastCheck: new Date() },
              { position: 'Aft Right', engaged: true, lastCheck: new Date() }
            ],
            overallStatus: 'engaged'
          };
        }
      });
    });
    setUldStatuses(initialStatuses);
    setSensorConnected(true);
  };

  const startMonitoring = (layout) => {
    setSelectedLayout(layout);
    initializeULDs(layout);
    setFlightStartTime(new Date());
    const firstPosition = positionLayouts[layout].positions[0].find(pos => pos);
    setSensorState({ uldPosition: firstPosition, lockIndex: 0, engaged: true });
    setCurrentView('monitoring');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'engaged':    return { bg: '#22c55e', border: '#16a34a', text: '#22c55e' };
      case 'partial':    return { bg: '#fbbf24', border: '#d97706', text: '#fbbf24' };
      case 'disengaged': return { bg: '#ef4444', border: '#dc2626', text: '#ef4444' };
      default:           return { bg: '#6b7280', border: '#4b5563', text: '#6b7280' };
    }
  };

  const toggleSensor = () => {
    const newEngaged = !sensorState.engaged;
    const { uldPosition, lockIndex } = sensorState;

    if (!newEngaged) playAlertBeep();

    const logEntry = {
      timestamp: new Date(),
      uldPosition,
      lockPosition: lockPositions[lockIndex],
      event: newEngaged ? 'ENGAGED' : 'DISENGAGED',
      value: newEngaged ? 1 : 0
    };
    setFlightLog(prevLog => [...prevLog, logEntry]);
    setSensorState(prev => ({ ...prev, engaged: newEngaged }));

    setUldStatuses(prevStatuses => {
      const updated = { ...prevStatuses };
      const targetULD = updated[uldPosition];
      if (targetULD) {
        targetULD.locks[lockIndex] = { ...targetULD.locks[lockIndex], engaged: newEngaged, lastCheck: new Date() };
        const engagedCount = targetULD.locks.filter(lock => lock.engaged).length;
        targetULD.overallStatus = engagedCount === 4 ? 'engaged' : engagedCount === 0 ? 'disengaged' : 'partial';
      }
      return updated;
    });
  };

  const renderConfigurationView = () => (
    <div className="animate-fadeIn min-h-screen bg-[#0a0f1a] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header Panel */}
        <div className="avion-panel mb-6">
          <div className="avion-panel-header">SYSTEM CONFIGURATION</div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-[#1e3a5f] rounded flex items-center justify-center">
                <Plane className="h-6 w-6 text-[#00d4ff]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-wide">BOEING 777F LOCK DETECTION</h1>
                <p className="text-[#6b7280] text-sm tracking-wider">DEMO MODE - SIMULATION ENVIRONMENT</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#fbbf24] bg-[#1e3a5f]/50 px-3 py-2 rounded">
              <AlertTriangle className="h-4 w-4" />
              <span>DEMO MODE: Simulated sensor data for testing and demonstration</span>
            </div>
          </div>
        </div>

        {/* Layout Selection */}
        <div className="avion-panel">
          <div className="avion-panel-header">SELECT AIRCRAFT CONFIGURATION</div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(positionLayouts).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => startMonitoring(key)}
                  className="bg-[#1e3a5f]/50 p-5 rounded border border-[#2d4a6f] hover:border-[#00d4ff] hover:bg-[#1e3a5f] transition-all text-left group"
                >
                  <h3 className="font-bold text-white mb-2 tracking-wide group-hover:text-[#00d4ff] transition-colors">
                    {config.name}
                  </h3>
                  <p className="text-xs text-[#6b7280] mb-3">{config.description}</p>
                  <div className="text-[#00d4ff] font-bold text-sm">
                    {config.positions.flat().filter(p => p).length} POSITIONS
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMonitoringView = () => {
    const layout = positionLayouts[selectedLayout];
    const activeAlerts = Object.entries(uldStatuses).filter(([_, status]) => status.overallStatus !== 'engaged');
    const engagedCount = Object.values(uldStatuses).filter(s => s.overallStatus === 'engaged').length;

    return (
      <div className="animate-fadeIn min-h-screen bg-[#0a0f1a]">
        {/* Status Bar */}
        <div className="bg-[#0d1321] border-b-2 border-[#1e3a5f] px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentView('configuration')} 
                className="text-[#6b7280] hover:text-[#00d4ff] transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white tracking-wide">LOCK STATUS MONITOR</h1>
                <p className="text-xs text-[#6b7280] tracking-wider">{layout.name} - DEMO MODE</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Status Summary */}
              <div className="flex items-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
                  <span className="text-[#22c55e] font-bold">{engagedCount}</span>
                  <span className="text-[#6b7280]">SECURE</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ef4444]"></div>
                  <span className="text-[#ef4444] font-bold">{activeAlerts.length}</span>
                  <span className="text-[#6b7280]">ALERT</span>
                </div>
              </div>
              <div className="w-px h-6 bg-[#1e3a5f]"></div>
              {/* Demo Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e3a5f] rounded">
                <div className={`w-2 h-2 rounded-full ${sensorConnected ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`}></div>
                <span className="text-xs font-bold text-[#6b7280]">DEMO ACTIVE</span>
              </div>
              <button
                onClick={() => setCurrentView('report')}
                className="flex items-center gap-2 px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] rounded text-xs font-bold transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span>REPORT</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Alerts Panel */}
              <div className="avion-panel">
                <div className="avion-panel-header flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  ACTIVE ALERTS
                </div>
                <div className="p-4">
                  {activeAlerts.length === 0 ? (
                    <div className="text-center py-6">
                      <CheckCircle className="h-10 w-10 text-[#22c55e] mx-auto mb-2" />
                      <p className="text-xs text-[#22c55e] font-bold">ALL LOCKS SECURE</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeAlerts.map(([position, status]) => (
                                        <div
                                          key={position}
                                          className="status-cell p-3 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded cursor-pointer hover:bg-[#ef4444]/20"
                                          onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
                                        >
                          <div className="font-bold text-[#ef4444] text-sm">ULD {position}</div>
                          <div className="text-xs text-[#ef4444]/70">
                            {status.overallStatus === 'partial' ? 'PARTIAL LOCK FAILURE' : 'ALL LOCKS DISENGAGED'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sensor Test Panel */}
              <div className="avion-panel">
                <div className="avion-panel-header">SENSOR SIMULATION</div>
                <div className="p-4 space-y-3">
                  <div className="text-xs text-[#6b7280]">
                    <span className="text-[#00d4ff]">ACTIVE:</span> ULD {sensorState.uldPosition} - {lockPositions[sensorState.lockIndex]}
                  </div>
                  <button
                    onClick={toggleSensor}
                    className={`w-full px-3 py-3 rounded text-sm font-bold transition-all ${
                      sensorState.engaged
                        ? 'bg-[#22c55e] hover:bg-[#16a34a] text-[#0a0f1a] shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                        : 'bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse-alert'
                    }`}
                  >
                    {sensorState.engaged ? 'ENGAGED (1)' : 'DISENGAGED (0)'}
                  </button>
                  <p className="text-xs text-[#6b7280] text-center">Click to toggle lock state</p>
                </div>
              </div>

              {/* Ground Operator Access - QR Code */}
              <div className="avion-panel">
                <div className="avion-panel-header flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  GROUND OPERATOR ACCESS
                  {viewerCount > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-xs font-normal text-[#22c55e]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                      {viewerCount} VIEWER{viewerCount !== 1 ? 'S' : ''}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  {socketConnected ? (
                    <>
                      <div className="flex justify-center p-3 bg-white rounded">
                        <QRCodeSVG value={viewerURL} size={120} level="M" />
                      </div>
                      <p className="text-xs text-[#6b7280] text-center">
                        Scan with phone on same network
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-2 py-1.5 bg-[#1e3a5f] rounded text-xs text-[#6b7280] truncate border border-[#2d4a6f] select-all">
                          {viewerURL}
                        </div>
                        <button
                          onClick={copyViewerLink}
                          className="shrink-0 p-1.5 rounded bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] transition-colors"
                          title="Copy link"
                        >
                          {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {linkCopied && (
                        <p className="text-xs text-[#22c55e] text-center">Link copied!</p>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-[#fbbf24] text-xs mb-2 font-bold">RELAY SERVER OFFLINE</div>
                      <p className="text-xs text-[#6b7280] mb-3">
                        To enable phone viewing, run the relay server locally:
                      </p>
                      <code className="block px-3 py-2 bg-[#1e3a5f] rounded text-xs text-[#00d4ff] font-mono">
                        node server.js
                      </code>
                      <p className="text-xs text-[#6b7280] mt-3">
                        Phone must be on the same WiFi network
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content - Cargo Grid */}
            <div className="lg:col-span-3">
              <div className="avion-panel">
                <div className="avion-panel-header flex items-center justify-between">
                  <span>CARGO DECK STATUS</span>
                  <div className="flex items-center gap-4 text-xs font-normal">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-[#22c55e]"></div>
                      <span className="text-[#6b7280]">ENGAGED</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-[#fbbf24]"></div>
                      <span className="text-[#6b7280]">PARTIAL</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-[#ef4444]"></div>
                      <span className="text-[#6b7280]">DISENGAGED</span>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {/* Aircraft outline */}
                  <div className="relative">
                    <div className="absolute inset-0 pointer-events-none opacity-10">
                      <svg className="w-full h-full" viewBox="0 0 800 200">
                        <path d="M 50 100 Q 50 70 80 70 L 720 70 Q 750 70 750 100 Q 750 130 720 130 L 80 130 Q 50 130 50 100 Z" stroke="#00d4ff" strokeWidth="2" fill="none" />
                      </svg>
                    </div>
                    <div className="relative z-10 space-y-3 p-4">
                      {layout.positions.map((row, rowIndex) => (
                        <div key={`row-${rowIndex}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${layout.gridCols}, 1fr)` }}>
                          {row.map((position, colIndex) => {
                            if (!position) return <div key={`empty-${colIndex}`} className="min-h-16"></div>;
                            const status = uldStatuses[position];
                            if (!status) return null;
                            const colors = getStatusColor(status.overallStatus);
                            const hasSensor = position === sensorState.uldPosition;
                            const isAlert = status.overallStatus !== 'engaged';
                            return (
                              <div
                                key={position}
                                className="status-cell relative border rounded p-2 min-h-16 flex flex-col items-center justify-center cursor-pointer hover:scale-105"
                                style={{ 
                                  backgroundColor: colors.bg + '15', 
                                  borderColor: colors.border,
                                  boxShadow: isAlert ? `0 0 12px ${colors.bg}50` : `0 0 4px ${colors.bg}20`
                                }}
                                onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
                              >
                                {hasSensor && (
                                  <div className="absolute top-1 right-1">
                                    <Radio className="h-3 w-3 text-[#00d4ff]" />
                                  </div>
                                )}
                                <div className="status-text font-bold text-sm" style={{ color: colors.text }}>{position}</div>
                                <div className="flex items-center mt-1 status-indicator">
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
                    <div className="mt-4 flex justify-between text-xs text-[#6b7280] px-4 tracking-wider">
                      <span>AFT</span>
                      <span>FORWARD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDetailView = () => {
    const status = uldStatuses[selectedULD];
    if (!status) return null;
    return (
      <div className="animate-fadeIn min-h-screen bg-[#0a0f1a]">
        <div className="bg-[#0d1321] border-b-2 border-[#1e3a5f] px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <button onClick={() => setCurrentView('monitoring')} className="text-[#6b7280] hover:text-[#00d4ff] transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">ULD {selectedULD} - LOCK DETAILS</h1>
              <p className="text-xs text-[#6b7280] tracking-wider">INDIVIDUAL LOCK STATUS</p>
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto p-6">
          <div className="avion-panel">
            <div className="avion-panel-header">LOCK POSITIONS</div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {status.locks.map((lock, index) => {
                  const isActiveSensor = selectedULD === sensorState.uldPosition && index === sensorState.lockIndex;
                  const colors = getStatusColor(lock.engaged ? 'engaged' : 'disengaged');
                  return (
                    <div
                      key={index}
                      className={`status-cell p-5 rounded border ${isActiveSensor ? 'ring-2 ring-[#00d4ff]' : ''}`}
                      style={{ backgroundColor: colors.bg + '10', borderColor: colors.border }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-white">{lock.position}</h3>
                        {isActiveSensor && (
                          <div className="flex items-center gap-1 text-[#00d4ff] text-xs font-medium">
                            <Radio className="h-3 w-3" />
                            <span>SENSOR</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        {lock.engaged
                          ? <CheckCircle className="h-8 w-8" style={{ color: colors.border }} />
                          : <AlertTriangle className="h-8 w-8" style={{ color: colors.border }} />}
                        <div>
                          <div className="font-bold text-lg" style={{ color: colors.text }}>
                            {lock.engaged ? 'ENGAGED' : 'DISENGAGED'}
                          </div>
                          <div className="text-xs text-[#6b7280]">VALUE: {lock.engaged ? '1' : '0'}</div>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-[#1e3a5f]">
                        <div className="flex items-center text-xs text-[#6b7280]">
                          <Clock className="h-3 w-3 mr-2" />
                          LAST CHECK: {lock.lastCheck.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const exportReport = () => {
    const engagementCount = flightLog.filter(log => log.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(log => log.event === 'DISENGAGED').length;
    const flightDuration = flightStartTime ? new Date() - flightStartTime : 0;
    const hours = Math.floor(flightDuration / 3600000);
    const minutes = Math.floor((flightDuration % 3600000) / 60000);
    const seconds = Math.floor((flightDuration % 60000) / 1000);
    let csvContent = "Boeing 777F Lock Detection System - Flight Report (DEMO MODE)\n";
    csvContent += `Generated: ${new Date().toLocaleString()}\n`;
    csvContent += `Configuration: ${positionLayouts[selectedLayout].name}\n`;
    csvContent += `Session Duration: ${hours}h ${minutes}m ${seconds}s\n`;
    csvContent += `Total Events: ${flightLog.length}\nEngagements: ${engagementCount}\nDisengagements: ${disengagementCount}\n\n`;
    csvContent += "Timestamp,ULD Position,Lock Position,Event,Value\n";
    flightLog.forEach(log => {
      csvContent += `"${log.timestamp.toLocaleString()}",${log.uldPosition},${log.lockPosition},${log.event},${log.value}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `Boeing777F_Demo_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderReportView = () => {
    const engagementCount = flightLog.filter(log => log.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(log => log.event === 'DISENGAGED').length;
    const flightDuration = flightStartTime ? new Date() - flightStartTime : 0;
    const hours = Math.floor(flightDuration / 3600000);
    const minutes = Math.floor((flightDuration % 3600000) / 60000);
    return (
      <div className="animate-fadeIn min-h-screen bg-[#0a0f1a]">
        <div className="bg-[#0d1321] border-b-2 border-[#1e3a5f] px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setCurrentView('monitoring')} className="text-[#6b7280] hover:text-[#00d4ff] transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white tracking-wide">SESSION REPORT</h1>
                <p className="text-xs text-[#6b7280] tracking-wider">LOCK ENGAGEMENT HISTORY - DEMO</p>
              </div>
            </div>
            <button onClick={exportReport} className="flex items-center gap-2 px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] rounded text-xs font-bold transition-colors">
              <Download className="h-4 w-4" />
              <span>EXPORT CSV</span>
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'SESSION DURATION', value: `${hours}h ${minutes}m`, color: 'text-white' },
              { label: 'TOTAL EVENTS', value: flightLog.length, color: 'text-white' },
              { label: 'ENGAGEMENTS', value: engagementCount, color: 'text-[#22c55e]' },
              { label: 'DISENGAGEMENTS', value: disengagementCount, color: 'text-[#ef4444]' },
            ].map(({ label, value, color }) => (
              <div key={label} className="avion-panel">
                <div className="p-4">
                  <div className="text-xs text-[#6b7280] mb-1 tracking-wider">{label}</div>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Event Timeline */}
          <div className="avion-panel">
            <div className="avion-panel-header">EVENT TIMELINE</div>
            <div className="overflow-auto max-h-96">
              <table className="min-w-full">
                <thead className="bg-[#1e3a5f] sticky top-0">
                  <tr>
                    {['TIMESTAMP', 'ULD POSITION', 'LOCK POSITION', 'EVENT', 'VALUE'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-[#00d4ff] tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e3a5f]">
                  {flightLog.length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-12 text-center text-[#6b7280]">No events recorded</td></tr>
                  ) : (
                    flightLog.slice().reverse().map((log, index) => (
                      <tr key={index} className="hover:bg-[#1e3a5f]/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#6b7280]">{log.timestamp.toLocaleTimeString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-white">{log.uldPosition}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#6b7280]">{log.lockPosition}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-bold rounded ${
                            log.event === 'ENGAGED' 
                              ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30' 
                              : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'
                          }`}>
                            {log.event}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{log.value}</td>
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
      {currentView === 'configuration' && renderConfigurationView()}
      {currentView === 'monitoring'    && renderMonitoringView()}
      {currentView === 'detail'        && renderDetailView()}
      {currentView === 'report'        && renderReportView()}
    </>
  );
};

export default LockDetectionSystem;
