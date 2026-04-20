import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Plane, AlertTriangle, CheckCircle, Radio, Clock,
  ArrowLeft, FileText, Download, Eye
} from 'lucide-react';

const SOCKET_URL = process.env.NODE_ENV === 'production'
  ? '' : `http://${window.location.hostname}:3001`;

const GroundOperatorViewer = () => {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [currentView, setCurrentView] = useState('monitoring');
  const [selectedULD, setSelectedULD] = useState(null);
  const socketRef = useRef(null);

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
      case 'engaged':    return { bg: '#22c55e', border: '#16a34a', text: '#22c55e' };
      case 'partial':    return { bg: '#fbbf24', border: '#d97706', text: '#fbbf24' };
      case 'disengaged': return { bg: '#ef4444', border: '#dc2626', text: '#ef4444' };
      default:           return { bg: '#6b7280', border: '#4b5563', text: '#6b7280' };
    }
  };

  /* Waiting screen - Mobile optimized */
  if (!state) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-[#1e3a5f] rounded-lg flex items-center justify-center mx-auto mb-4">
            <Plane className="h-8 w-8 text-[#00d4ff]" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1 tracking-wide">
            BOEING 777F
          </h1>
          <p className="text-[#6b7280] text-sm mb-6 tracking-wider">CARGO LOCK DETECTION</p>

          <div className="avion-panel">
            <div className="avion-panel-header">CONNECTION STATUS</div>
            <div className="p-6">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className={`w-3 h-3 rounded-full ${connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#ef4444]'}`} />
                <span className="text-sm font-bold text-white">
                  {connected ? 'CONNECTED' : 'CONNECTING...'}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 text-[#6b7280]">
                <div className="animate-spin h-4 w-4 border-2 border-[#00d4ff] border-t-transparent rounded-full" />
                <span className="text-xs tracking-wider">WAITING FOR MASTER STATION</span>
              </div>
            </div>
          </div>

          <div className="mt-6 text-xs text-[#6b7280]">
            GROUND OPERATOR VIEWER
          </div>
        </div>
      </div>
    );
  }

  /* Parse received state */
  const { layoutConfig, uldStatuses, flightLog, flightStartTime, connectionStatus, lastSensorData } = state;
  const activeAlerts = Object.entries(uldStatuses).filter(([, s]) => s.overallStatus !== 'engaged');
  const totalPositions = Object.keys(uldStatuses).length;
  const securedCount = totalPositions - activeAlerts.length;

  /* Header - Mobile optimized */
  const renderHeader = () => (
    <header className="bg-[#0d1321] border-b-2 border-[#1e3a5f] sticky top-0 z-20">
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {currentView !== 'monitoring' && (
            <button
              onClick={() => setCurrentView('monitoring')}
              className="text-[#6b7280] hover:text-[#00d4ff] transition-colors p-1"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-[#00d4ff] shrink-0" />
                <h1 className="text-xs sm:text-sm font-bold text-white tracking-wider">
                  GROUND VIEWER
                </h1>
              </div>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                connected
                  ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
                  : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#ef4444]'}`} />
                {connected ? 'LIVE' : 'OFFLINE'}
              </div>
            </div>
            <p className="text-[10px] text-[#6b7280] truncate tracking-wider">
              {layoutConfig?.name} - {connectionStatus === 'connected' ? 'ACTIVE' : connectionStatus?.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {currentView === 'monitoring' && (
            <button
              onClick={() => setCurrentView('report')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] rounded text-xs font-bold transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">REPORT</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );

  /* Monitoring View - Mobile optimized */
  const renderMonitoringView = () => (
    <div className="animate-fadeIn">
      {/* Alert banner - prominent on mobile */}
      {activeAlerts.length > 0 && (
        <div className="bg-[#ef4444] text-white px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" />
            <span>{activeAlerts.length} ALERT{activeAlerts.length > 1 ? 'S' : ''} - LOCK FAILURE DETECTED</span>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="bg-[#0d1321] border-b border-[#1e3a5f] px-4 py-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white">{totalPositions}</span>
            <span className="text-[#6b7280]">ULDs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
            <span className="font-bold text-[#22c55e]">{securedCount}</span>
            <span className="text-[#6b7280]">SECURE</span>
          </div>
          {activeAlerts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
              <span className="font-bold text-[#ef4444]">{activeAlerts.length}</span>
              <span className="text-[#6b7280]">ALERT</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3 max-w-7xl mx-auto">
        {/* Alert cards - Large touch targets for mobile */}
        {activeAlerts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeAlerts.map(([position, status]) => (
              <button
                key={position}
                className="p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg text-left animate-pulse-alert transition-all active:scale-[0.98] hover:bg-[#ef4444]/20"
                onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
              >
                <div className="font-bold text-[#ef4444] text-base">ULD {position}</div>
                <div className="text-xs text-[#ef4444]/70">
                  {status.overallStatus === 'partial' ? 'PARTIAL LOCK FAILURE' : 'ALL LOCKS DISENGAGED'}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Cargo deck grid */}
        {layoutConfig && (
          <div className="avion-panel">
            <div className="avion-panel-header flex items-center justify-between">
              <span>CARGO DECK STATUS</span>
              <div className="hidden sm:flex items-center gap-3 text-xs font-normal">
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-[#22c55e]"></div><span className="text-[#6b7280]">ENGAGED</span></div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-[#fbbf24]"></div><span className="text-[#6b7280]">PARTIAL</span></div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-[#ef4444]"></div><span className="text-[#6b7280]">DISENGAGED</span></div>
              </div>
            </div>
            <div className="p-3 sm:p-4">
              {/* Mobile legend */}
              <div className="flex sm:hidden items-center gap-3 mb-3 text-[10px] text-[#6b7280]">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-[#22c55e]"></div><span>OK</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-[#fbbf24]"></div><span>PARTIAL</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-[#ef4444]"></div><span>ALERT</span></div>
              </div>

              {/* Scrollable grid */}
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-2">
                <div className="space-y-1.5 sm:space-y-2" style={{ minWidth: layoutConfig.gridCols * 48 }}>
                  {layoutConfig.positions.map((row, rowIndex) => (
                    <div key={`row-${rowIndex}`} className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${layoutConfig.gridCols}, 1fr)` }}>
                      {row.map((position, colIndex) => {
                        if (!position) return <div key={`empty-${colIndex}`} className="min-h-[44px] sm:min-h-[56px]" />;
                        const status = uldStatuses[position];
                        if (!status) return null;
                        const colors = getStatusColor(status.overallStatus);
                        const hasSensor = lastSensorData && position === lastSensorData.uldPosition;
                        const isAlert = status.overallStatus !== 'engaged';
                        return (
                          <button
                            key={position}
                            className={`relative border rounded p-1 min-h-[44px] sm:min-h-[56px] flex flex-col items-center justify-center transition-all active:scale-[0.95] ${isAlert ? 'animate-pulse-alert' : ''}`}
                            style={{ 
                              backgroundColor: colors.bg + '15', 
                              borderColor: colors.border,
                              boxShadow: isAlert ? `0 0 8px ${colors.bg}40` : 'none'
                            }}
                            onClick={() => { setSelectedULD(position); setCurrentView('detail'); }}
                          >
                            {hasSensor && <div className="absolute top-0.5 right-0.5"><Radio className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-[#00d4ff]" /></div>}
                            <div className="font-bold text-[9px] sm:text-xs leading-tight" style={{ color: colors.text }}>{position}</div>
                            <div className="flex items-center mt-0.5">
                              {status.overallStatus === 'engaged'
                                ? <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color: colors.border }} />
                                : <AlertTriangle className="h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color: colors.border }} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex justify-between text-[9px] sm:text-xs text-[#6b7280] px-1 tracking-wider">
                <span>AFT</span><span>FORWARD</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* Detail View - Mobile optimized */
  const renderDetailView = () => {
    const status = uldStatuses[selectedULD];
    if (!status) { setCurrentView('monitoring'); return null; }
    return (
      <div className="animate-fadeIn p-3 max-w-4xl mx-auto">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-white tracking-wide">ULD {selectedULD}</h2>
          <p className="text-xs text-[#6b7280] tracking-wider">INDIVIDUAL LOCK STATUS</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          {status.locks.map((lock, index) => {
            const isActiveSensor = lastSensorData && selectedULD === lastSensorData.uldPosition && index === lastSensorData.lockIndex;
            const colors = getStatusColor(lock.engaged ? 'engaged' : 'disengaged');
            return (
              <div
                key={index}
                className={`p-4 rounded border transition-all ${isActiveSensor ? 'ring-2 ring-[#00d4ff]' : ''} ${!lock.engaged ? 'animate-pulse-alert' : ''}`}
                style={{ backgroundColor: colors.bg + '10', borderColor: colors.border }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-white">{lock.position}</h3>
                  {isActiveSensor && (
                    <div className="flex items-center gap-1 text-[#00d4ff] text-[10px] font-bold">
                      <Radio className="h-3 w-3" /><span>SENSOR</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-3">
                  {lock.engaged
                    ? <CheckCircle className="h-6 w-6" style={{ color: colors.border }} />
                    : <AlertTriangle className="h-6 w-6" style={{ color: colors.border }} />}
                  <div>
                    <div className="font-bold text-base" style={{ color: colors.text }}>
                      {lock.engaged ? 'ENGAGED' : 'DISENGAGED'}
                    </div>
                    <div className="text-[10px] text-[#6b7280]">VALUE: {lock.engaged ? '1' : '0'}</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#1e3a5f]">
                  <div className="flex items-center text-[10px] text-[#6b7280]">
                    <Clock className="h-3 w-3 mr-1.5" />
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

  /* Report View - Mobile optimized */
  const renderReportView = () => {
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
      <div className="animate-fadeIn p-3 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">SESSION REPORT</h2>
            <p className="text-[10px] text-[#6b7280] tracking-wider">LOCK EVENT HISTORY</p>
          </div>
          <button
            onClick={exportReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00d4ff] hover:bg-[#00b8e0] text-[#0a0f1a] rounded text-xs font-bold transition-colors"
          >
            <Download className="h-3.5 w-3.5" /><span>CSV</span>
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          {[
            { label: 'DURATION', value: `${hours}h ${minutes}m`, color: 'text-white' },
            { label: 'TOTAL EVENTS', value: flightLog.length, color: 'text-white' },
            { label: 'ENGAGEMENTS', value: engagementCount, color: 'text-[#22c55e]' },
            { label: 'DISENGAGEMENTS', value: disengagementCount, color: 'text-[#ef4444]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="avion-panel">
              <div className="p-3">
                <div className="text-[9px] text-[#6b7280] mb-0.5 tracking-wider">{label}</div>
                <div className={`text-lg font-bold ${color}`}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Event table */}
        <div className="avion-panel">
          <div className="avion-panel-header">EVENT TIMELINE</div>
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full">
              <thead className="bg-[#1e3a5f] sticky top-0">
                <tr>
                  {['TIME', 'ULD', 'LOCK', 'EVENT', 'VAL'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-[9px] font-bold text-[#00d4ff] tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e3a5f]">
                {flightLog.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-10 text-center text-xs text-[#6b7280]">No events recorded yet</td></tr>
                ) : (
                  flightLog.slice().reverse().map((log, i) => (
                    <tr key={i} className="hover:bg-[#1e3a5f]/30">
                      <td className="px-2 py-2 whitespace-nowrap text-[10px] text-[#6b7280]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-[10px] font-bold text-white">{log.uldPosition}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-[10px] text-[#6b7280]">{log.lockPosition}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                          log.event === 'ENGAGED'
                            ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
                            : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'
                        }`}>{log.event}</span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-[10px] text-white">{log.value}</td>
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

  /* Main render */
  return (
    <div className="min-h-screen bg-[#0a0f1a] font-mono">
      {renderHeader()}
      {currentView === 'monitoring' && renderMonitoringView()}
      {currentView === 'detail'     && renderDetailView()}
      {currentView === 'report'     && renderReportView()}
    </div>
  );
};

export default GroundOperatorViewer;
