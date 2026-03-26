import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Plane, AlertTriangle, CheckCircle, Radio, Clock,
  ArrowLeft, FileText, Download, Sun, Moon, Eye
} from 'lucide-react';

const SOCKET_URL = process.env.NODE_ENV === 'production'
  ? '' : `http://${window.location.hostname}:3001`;

const GroundOperatorViewer = () => {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [currentView, setCurrentView] = useState('monitoring');
  const [selectedULD, setSelectedULD] = useState(null);
  const [theme, setTheme] = useState('light');
  const socketRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('register-viewer');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('state-update', (data) => setState(data));
    return () => socket.disconnect();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'engaged':    return { bg: '#10B981', border: '#059669', text: '#065F46' };
      case 'partial':    return { bg: '#F59E0B', border: '#D97706', text: '#92400E' };
      case 'disengaged': return { bg: '#EF4444', border: '#DC2626', text: '#991B1B' };
      default:           return { bg: '#6B7280', border: '#4B5563', text: '#1F2937' };
    }
  };

  /* ── Waiting screen ── */
  if (!state) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <Plane className="h-14 w-14 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">
            Boeing 777F Lock System
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mb-6">Ground Operator View</p>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                {connected ? 'Connected to relay server' : 'Connecting...'}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-slate-400">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-sm">Waiting for master station...</span>
            </div>
          </div>

          <button
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            className="mt-6 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
        </div>
      </div>
    );
  }

  /* ── Parse received state ── */
  const { layoutConfig, uldStatuses, flightLog, flightStartTime, connectionStatus, lastSensorData } = state;
  const activeAlerts = Object.entries(uldStatuses).filter(([, s]) => s.overallStatus !== 'engaged');
  const totalPositions = Object.keys(uldStatuses).length;
  const securedCount = totalPositions - activeAlerts.length;

  /* ── Header ── */
  const Header = () => (
    <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm sticky top-0 z-20">
      <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {currentView !== 'monitoring' && (
            <button
              onClick={() => setCurrentView('monitoring')}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors p-1"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <h1 className="text-sm sm:text-base font-bold text-gray-900 dark:text-slate-100">
                  Ground Operator
                </h1>
              </div>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold shrink-0 ${
                connected
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {connected ? 'LIVE' : 'OFFLINE'}
              </div>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 truncate">
              {layoutConfig?.name} — USB {connectionStatus === 'connected' ? 'Active' : connectionStatus}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {currentView === 'monitoring' && (
            <button
              onClick={() => setCurrentView('report')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Report</span>
            </button>
          )}
          <button
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            className="p-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );

  /* ── Monitoring View ── */
  const MonitoringView = () => (
    <div className="animate-fadeIn">
      {/* Alert banner */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-600 text-white px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{activeAlerts.length} Alert{activeAlerts.length > 1 ? 's' : ''} — Lock failure detected</span>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-2">
        <div className="flex items-center gap-4 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900 dark:text-slate-100">{totalPositions}</span>
            <span className="text-gray-500 dark:text-slate-400">ULDs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-semibold text-green-700 dark:text-green-400">{securedCount}</span>
            <span className="text-gray-500 dark:text-slate-400">Secured</span>
          </div>
          {activeAlerts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-semibold text-red-700 dark:text-red-400">{activeAlerts.length}</span>
              <span className="text-gray-500 dark:text-slate-400">Alerts</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-4 max-w-7xl mx-auto">
        {/* Alert cards */}
        {activeAlerts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {activeAlerts.map(([position, status]) => (
              <div
                key={position}
                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 animate-pulse-alert transition-colors active:scale-[0.98]"
                onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
              >
                <div className="font-semibold text-red-900 dark:text-red-300">ULD {position}</div>
                <div className="text-xs sm:text-sm text-red-700 dark:text-red-400">
                  {status.overallStatus === 'partial' ? 'Partial Lock Failure' : 'All Locks Disengaged'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cargo deck grid */}
        {layoutConfig && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-3 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-100">Cargo Deck Status</h2>
              <div className="hidden sm:flex items-center space-x-4 text-sm text-gray-600 dark:text-slate-400">
                <div className="flex items-center space-x-1.5"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#10B981' }} /><span>Engaged</span></div>
                <div className="flex items-center space-x-1.5"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#F59E0B' }} /><span>Partial</span></div>
                <div className="flex items-center space-x-1.5"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#EF4444' }} /><span>Disengaged</span></div>
              </div>
            </div>

            {/* Mobile legend */}
            <div className="flex sm:hidden items-center gap-3 mb-3 text-[11px] text-gray-500 dark:text-slate-400">
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#10B981' }} /><span>OK</span></div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#F59E0B' }} /><span>Partial</span></div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#EF4444' }} /><span>Alert</span></div>
            </div>

            {/* Scrollable grid */}
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-2">
              <div className="space-y-1.5 sm:space-y-3" style={{ minWidth: layoutConfig.gridCols * 52 }}>
                {layoutConfig.positions.map((row, rowIndex) => (
                  <div key={`row-${rowIndex}`} className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${layoutConfig.gridCols}, 1fr)` }}>
                    {row.map((position, colIndex) => {
                      if (!position) return <div key={`empty-${colIndex}`} className="min-h-[48px] sm:min-h-[72px]" />;
                      const status = uldStatuses[position];
                      if (!status) return null;
                      const colors = getStatusColor(status.overallStatus);
                      const hasSensor = lastSensorData && position === lastSensorData.uldPosition;
                      const isAlert = status.overallStatus !== 'engaged';
                      return (
                        <div
                          key={position}
                          className={`relative border-2 rounded-md sm:rounded-lg p-1 sm:p-3 min-h-[48px] sm:min-h-[72px] flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-lg active:scale-[0.95] ${isAlert ? 'animate-pulse-alert' : ''}`}
                          style={{ backgroundColor: colors.bg + '20', borderColor: colors.border }}
                          onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
                        >
                          {hasSensor && <div className="absolute top-0.5 right-0.5"><Radio className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-600 dark:text-blue-400" /></div>}
                          <div className="font-bold text-[10px] sm:text-base leading-tight" style={{ color: colors.text }}>{position}</div>
                          <div className="flex items-center mt-0.5">
                            {status.overallStatus === 'engaged'
                              ? <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: colors.border }} />
                              : <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: colors.border }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 sm:mt-4 flex justify-between text-[10px] sm:text-sm text-gray-400 dark:text-slate-500 px-1">
              <span>AFT</span><span>FORWARD</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Detail View ── */
  const DetailView = () => {
    const status = uldStatuses[selectedULD];
    if (!status) { setCurrentView('monitoring'); return null; }
    return (
      <div className="animate-fadeIn p-3 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100">ULD {selectedULD}</h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">Individual Lock Status</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {status.locks.map((lock, index) => {
            const isActiveSensor = lastSensorData && selectedULD === lastSensorData.uldPosition && index === lastSensorData.lockIndex;
            const colors = getStatusColor(lock.engaged ? 'engaged' : 'disengaged');
            return (
              <div
                key={index}
                className={`p-4 sm:p-6 rounded-xl border-2 transition-all ${isActiveSensor ? 'ring-4 ring-blue-400 dark:ring-blue-500' : ''} ${!lock.engaged ? 'animate-pulse-alert' : ''}`}
                style={{ backgroundColor: colors.bg + '15', borderColor: colors.border }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm sm:text-lg text-gray-900 dark:text-slate-100">{lock.position}</h3>
                  {isActiveSensor && (
                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-medium">
                      <Radio className="h-3.5 w-3.5" /><span>Sensor</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-3">
                  {lock.engaged
                    ? <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: colors.border }} />
                    : <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: colors.border }} />}
                  <div>
                    <div className="font-semibold text-base sm:text-xl" style={{ color: colors.text }}>
                      {lock.engaged ? 'ENGAGED' : 'DISENGAGED'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">Value: {lock.engaged ? '1' : '0'}</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                  <div className="flex items-center text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                    <Clock className="h-3.5 w-3.5 mr-1.5" />
                    {new Date(lock.lastCheck).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── Report View ── */
  const ReportView = () => {
    const engagementCount = flightLog.filter(l => l.event === 'ENGAGED').length;
    const disengagementCount = flightLog.filter(l => l.event === 'DISENGAGED').length;
    const d = flightStartTime ? new Date() - new Date(flightStartTime) : 0;
    const hours = Math.floor(d / 3600000);
    const minutes = Math.floor((d % 3600000) / 60000);

    const exportReport = () => {
      const header = `Boeing 777F Lock System - Ground Operator Report\nGenerated: ${new Date().toLocaleString()}\nConfiguration: ${layoutConfig?.name}\nDuration: ${hours}h ${minutes}m\nTotal Events: ${flightLog.length}\n\n`;
      let csv = header + 'Timestamp,ULD Position,Lock Position,Event,Value\n';
      flightLog.forEach(l => {
        csv += `"${new Date(l.timestamp).toLocaleString()}",${l.uldPosition},${l.lockPosition},${l.event},${l.value}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Boeing777F_GroundOp_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
    };

    return (
      <div className="animate-fadeIn p-3 sm:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-slate-100">Flight Report</h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">Lock Event History</p>
          </div>
          <button
            onClick={exportReport}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm transition-colors"
          >
            <Download className="h-3.5 w-3.5" /><span>CSV</span>
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4">
          {[
            { label: 'Duration',       value: `${hours}h ${minutes}m`, color: 'text-gray-900 dark:text-slate-100' },
            { label: 'Total Events',   value: flightLog.length,        color: 'text-gray-900 dark:text-slate-100' },
            { label: 'Engagements',    value: engagementCount,         color: 'text-green-600 dark:text-green-400' },
            { label: 'Disengagements', value: disengagementCount,      color: 'text-red-600 dark:text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-3 sm:p-4">
              <div className="text-[11px] sm:text-sm text-gray-500 dark:text-slate-400 mb-0.5">{label}</div>
              <div className={`text-lg sm:text-2xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Event table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
          <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-slate-700">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-100">Event Timeline</h3>
          </div>
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0">
                <tr>
                  {['Time', 'ULD', 'Lock', 'Event', 'Val'].map(h => (
                    <th key={h} className="px-2 sm:px-6 py-2 text-left text-[10px] sm:text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                {flightLog.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-10 text-center text-sm text-gray-400 dark:text-slate-500">No events recorded yet</td></tr>
                ) : (
                  flightLog.slice().reverse().map((log, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-2 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-[11px] sm:text-sm text-gray-900 dark:text-slate-200">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-[11px] sm:text-sm font-medium text-gray-900 dark:text-slate-200">{log.uldPosition}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-[11px] sm:text-sm text-gray-500 dark:text-slate-400">{log.lockPosition}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-3 whitespace-nowrap">
                        <span className={`px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full ${
                          log.event === 'ENGAGED'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        }`}>{log.event}</span>
                      </td>
                      <td className="px-2 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-[11px] sm:text-sm text-gray-900 dark:text-slate-200">{log.value}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  /* ── Main render ── */
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
      <Header />
      {currentView === 'monitoring' && <MonitoringView />}
      {currentView === 'detail'     && <DetailView />}
      {currentView === 'report'     && <ReportView />}
    </div>
  );
};

export default GroundOperatorViewer;
