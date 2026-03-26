import React, { useState, useRef, useCallback } from 'react';
import { Plane, AlertTriangle, CheckCircle, Radio, Clock, ArrowLeft, FileText, Download, Wifi, WifiOff } from 'lucide-react';

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
  const [arduinoIP, setArduinoIP] = useState('192.168.1.100');
  const [arduinoPort, setArduinoPort] = useState('81');
  const [lastSensorData, setLastSensorData] = useState(null);
  const [connectionError, setConnectionError] = useState('');

  const websocketRef = useRef(null);
  const lockPositions = ['Forward Left', 'Forward Right', 'Aft Left', 'Aft Right'];

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
    setLastSensorData(data);
    if (!engaged) playAlertBeep();
    setFlightLog(prevLog => [...prevLog, {
      timestamp: new Date(),
      uldPosition,
      lockPosition: lockPositions[lockIndex],
      event: engaged ? 'ENGAGED' : 'DISENGAGED',
      value: engaged ? 1 : 0
    }]);
    setUldStatuses(prevStatuses => {
      const updated = { ...prevStatuses };
      const targetULD = updated[uldPosition];
      if (targetULD) {
        targetULD.locks[lockIndex] = { ...targetULD.locks[lockIndex], engaged, lastCheck: new Date() };
        const engagedCount = targetULD.locks.filter(l => l.engaged).length;
        targetULD.overallStatus = engagedCount === 4 ? 'engaged' : engagedCount === 0 ? 'disengaged' : 'partial';
      }
      return updated;
    });
  }, []);

  const connectToArduino = useCallback(() => {
    if (websocketRef.current) websocketRef.current.close();
    setConnectionStatus('connecting');
    setConnectionError('');
    try {
      const ws = new WebSocket(`ws://${arduinoIP}:${arduinoPort}`);
      ws.onopen = () => { setConnectionStatus('connected'); setConnectionError(''); };
      ws.onmessage = (event) => { try { processSensorData(JSON.parse(event.data)); } catch (e) {} };
      ws.onerror = () => { setConnectionError('Connection error. Check IP and port.'); setConnectionStatus('error'); };
      ws.onclose = () => { if (connectionStatus === 'connected') setConnectionStatus('disconnected'); };
      websocketRef.current = ws;
    } catch (error) {
      setConnectionError(`Failed to connect: ${error.message}`);
      setConnectionStatus('error');
    }
  }, [arduinoIP, arduinoPort, processSensorData, connectionStatus]);

  const disconnectFromArduino = useCallback(() => {
    if (websocketRef.current) { websocketRef.current.close(); websocketRef.current = null; }
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
              <p className="text-gray-500 dark:text-slate-400">Wireless Connection — Select Aircraft Configuration</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-400 dark:text-slate-500 mt-3">
            <Wifi className="h-4 w-4" />
            <span>Wi-Fi WebSocket connection to Arduino Uno Wi-Fi Rev4</span>
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
                <p className="text-sm text-gray-500 dark:text-slate-400">{layout.name} — Wireless</p>
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
                  {connectionStatus === 'connected' ? 'Arduino Connected' :
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

              {/* Wireless Connection Panel */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center">
                  {connectionStatus === 'connected'
                    ? <Wifi className="h-4 w-4 mr-2 text-green-500" />
                    : <WifiOff className="h-4 w-4 mr-2 text-gray-400 dark:text-slate-500" />}
                  Arduino Connection
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Arduino IP Address</label>
                    <input
                      type="text"
                      value={arduinoIP}
                      onChange={(e) => setArduinoIP(e.target.value)}
                      disabled={connectionStatus === 'connected'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">WebSocket Port</label>
                    <input
                      type="text"
                      value={arduinoPort}
                      onChange={(e) => setArduinoPort(e.target.value)}
                      disabled={connectionStatus === 'connected'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                      placeholder="81"
                    />
                  </div>
                  {connectionError && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-200 dark:border-red-800">
                      {connectionError}
                    </div>
                  )}
                  {connectionStatus === 'connected' ? (
                    <button onClick={disconnectFromArduino} className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-colors">
                      <WifiOff className="h-4 w-4" /><span>Disconnect</span>
                    </button>
                  ) : (
                    <button onClick={connectToArduino} disabled={connectionStatus === 'connecting'} className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center space-x-2 disabled:opacity-60 transition-colors">
                      <Wifi className="h-4 w-4" /><span>{connectionStatus === 'connecting' ? 'Connecting...' : 'Connect to Arduino'}</span>
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
    let csv = `Boeing 777F Lock Detection System - Flight Report (Wireless)\nGenerated: ${new Date().toLocaleString()}\nConfiguration: ${positionLayouts[selectedLayout].name}\nFlight Duration: ${hours}h ${minutes}m ${seconds}s\nTotal Events: ${flightLog.length}\nEngagements: ${engagementCount}\nDisengagements: ${disengagementCount}\n\nTimestamp,ULD Position,Lock Position,Event,Value\n`;
    flightLog.forEach(l => { csv += `"${l.timestamp.toLocaleString()}",${l.uldPosition},${l.lockPosition},${l.event},${l.value}\n`; });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
    link.setAttribute('download', `Boeing777F_Wireless_Report_${new Date().toISOString().slice(0, 10)}.csv`);
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
                <p className="text-sm text-gray-500 dark:text-slate-400">Lock Engagement History (Wireless)</p>
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
