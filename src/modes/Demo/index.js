import React, { useState } from 'react';
import { Plane, AlertTriangle, CheckCircle, Radio, Clock, ArrowLeft, FileText, Download } from 'lucide-react';

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
  const [sensorConnected, setSensorConnected] = useState(false);
  const [sensorState, setSensorState] = useState({
    uldPosition: 'AR',
    lockIndex: 0,
    engaged: true
  });

  const lockPositions = ['Forward Left', 'Forward Right', 'Aft Left', 'Aft Right'];

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
      case 'engaged':    return { bg: '#10B981', border: '#059669', text: '#065F46' };
      case 'partial':    return { bg: '#F59E0B', border: '#D97706', text: '#92400E' };
      case 'disengaged': return { bg: '#EF4444', border: '#DC2626', text: '#991B1B' };
      default:           return { bg: '#6B7280', border: '#4B5563', text: '#1F2937' };
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

  const ConfigurationView = () => (
    <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-8 mb-6 border border-gray-100 dark:border-slate-700">
          <div className="flex items-center space-x-3 mb-2">
            <Plane className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Boeing 777F Lock Detection System</h1>
              <p className="text-gray-500 dark:text-slate-400">Demo Mode — Select Aircraft Configuration</p>
            </div>
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
              <button onClick={() => setCurrentView('configuration')} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Lock Status Monitor</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">{layout.name}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${sensorConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {sensorConnected ? 'Sensor Active' : 'No Connection'}
                </span>
              </div>
              <button
                onClick={() => setCurrentView('report')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span>Flight Report</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
                  Active Alerts
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

              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">Sensor Test</h3>
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Active: ULD {sensorState.uldPosition} — {lockPositions[sensorState.lockIndex]}
                  </div>
                  <button
                    onClick={toggleSensor}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      sensorState.engaged
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {sensorState.engaged ? 'Engaged (1)' : 'Disengaged (0)'}
                  </button>
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
                          const hasSensor = position === sensorState.uldPosition;
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
                              <div className="flex items-center space-x-1 mt-1">
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
                const isActiveSensor = selectedULD === sensorState.uldPosition && index === sensorState.lockIndex;
                const colors = getStatusColor(lock.engaged ? 'engaged' : 'disengaged');
                return (
                  <div
                    key={index}
                    className={`p-6 rounded-xl border-2 transition-all ${isActiveSensor ? 'ring-4 ring-blue-400 dark:ring-blue-500' : ''} ${!lock.engaged ? 'animate-pulse-alert' : ''}`}
                    style={{ backgroundColor: colors.bg + '15', borderColor: colors.border }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-slate-100">{lock.position}</h3>
                      {isActiveSensor && (
                        <div className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 text-sm font-medium">
                          <Radio className="h-4 w-4" /><span>Sensor</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 mb-4">
                      {lock.engaged
                        ? <CheckCircle className="h-8 w-8" style={{ color: colors.border }} />
                        : <AlertTriangle className="h-8 w-8" style={{ color: colors.border }} />}
                      <div>
                        <div className="font-semibold text-xl" style={{ color: colors.text }}>
                          {lock.engaged ? 'ENGAGED' : 'DISENGAGED'}
                        </div>
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
    const engagementCount = flightLog.filter(log => log.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(log => log.event === 'DISENGAGED').length;
    const flightDuration = flightStartTime ? new Date() - flightStartTime : 0;
    const hours = Math.floor(flightDuration / 3600000);
    const minutes = Math.floor((flightDuration % 3600000) / 60000);
    const seconds = Math.floor((flightDuration % 60000) / 1000);
    let csvContent = "Boeing 777F Lock Detection System - Flight Report\n";
    csvContent += `Generated: ${new Date().toLocaleString()}\n`;
    csvContent += `Configuration: ${positionLayouts[selectedLayout].name}\n`;
    csvContent += `Flight Duration: ${hours}h ${minutes}m ${seconds}s\n`;
    csvContent += `Total Events: ${flightLog.length}\nEngagements: ${engagementCount}\nDisengagements: ${disengagementCount}\n\n`;
    csvContent += "Timestamp,ULD Position,Lock Position,Event,Value\n";
    flightLog.forEach(log => {
      csvContent += `"${log.timestamp.toLocaleString()}",${log.uldPosition},${log.lockPosition},${log.event},${log.value}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `Boeing777F_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const ReportView = () => {
    const engagementCount = flightLog.filter(log => log.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(log => log.event === 'DISENGAGED').length;
    const flightDuration = flightStartTime ? new Date() - flightStartTime : 0;
    const hours = Math.floor(flightDuration / 3600000);
    const minutes = Math.floor((flightDuration % 3600000) / 60000);
    return (
      <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setCurrentView('monitoring')} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Flight Report</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">Lock Engagement History</p>
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
              { label: 'Total Events',    value: flightLog.length,         color: 'text-gray-900 dark:text-slate-100' },
              { label: 'Engagements',     value: engagementCount,          color: 'text-green-600 dark:text-green-400' },
              { label: 'Disengagements',  value: disengagementCount,       color: 'text-red-600 dark:text-red-400' },
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
                  <tr>
                    {['Timestamp', 'ULD Position', 'Lock Position', 'Event', 'Value'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {flightLog.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400 dark:text-slate-500">No events recorded</td></tr>
                  ) : (
                    flightLog.slice().reverse().map((log, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-slate-200">{log.timestamp.toLocaleTimeString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">{log.uldPosition}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">{log.lockPosition}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${log.event === 'ENGAGED' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                            {log.event}
                          </span>
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
