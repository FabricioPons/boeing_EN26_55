import React, { useState, useRef, useCallback } from 'react';
import { Plane, AlertTriangle, CheckCircle, Radio, Clock, ArrowLeft, FileText, Download, Cable, Unplug } from 'lucide-react';

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

  // Serial connection state
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'error'
  const [lastSensorData, setLastSensorData] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [baudRate, setBaudRate] = useState('115200');

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readableStreamClosedRef = useRef(null);

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
  };

  const startMonitoring = (layout) => {
    setSelectedLayout(layout);
    initializeULDs(layout);
    setFlightStartTime(new Date());
    setCurrentView('monitoring');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'engaged': return { bg: '#10B981', border: '#059669', text: '#065F46' };
      case 'partial': return { bg: '#F59E0B', border: '#D97706', text: '#92400E' };
      case 'disengaged': return { bg: '#EF4444', border: '#DC2626', text: '#991B1B' };
      default: return { bg: '#6B7280', border: '#4B5563', text: '#1F2937' };
    }
  };

  // Track previous states to detect actual changes (not periodic updates)
  const previousStatesRef = useRef({});

  // Process incoming sensor data from Arduino
  const processSensorData = useCallback((data) => {
    /*
     * Expected data format from Arduino (JSON over Serial):
     * {
     *   "uldPosition": "AR",      // Which ULD position
     *   "lockIndex": 0,           // 0-3 for the four lock positions
     *   "engaged": true/false,    // Lock state
     *   "value": 1/0              // Raw sensor value
     * }
     */

    const { uldPosition, lockIndex, engaged } = data;

    setLastSensorData(data);

    // For Center Load layout, map "AR" -> "A", "BR" -> "B", etc.
    // Also handle "AL" -> "A", "BL" -> "B" for flexibility
    const basePosition = uldPosition.replace(/[LR]$/, '');

    // Check if this is an actual state change (not just a periodic update)
    const stateKey = `${uldPosition}-${lockIndex}`;
    const previousState = previousStatesRef.current[stateKey];
    const isStateChange = previousState === undefined || previousState !== engaged;

    // Update the previous state tracker
    previousStatesRef.current[stateKey] = engaged;

    // Only log to flight report if the state actually changed
    if (isStateChange) {
      const logEntry = {
        timestamp: new Date(),
        uldPosition: uldPosition,
        lockPosition: lockPositions[lockIndex],
        event: engaged ? 'ENGAGED' : 'DISENGAGED',
        value: engaged ? 1 : 0
      };
      setFlightLog(prevLog => [...prevLog, logEntry]);
    }

    // Update ULD status - try both the original position and base position (for Center Load)
    setUldStatuses(prevStatuses => {
      const updated = { ...prevStatuses };

      // Try to find the ULD - first try exact match, then try base position (for Center Load)
      let targetULD = updated[uldPosition];

      if (!targetULD && updated[basePosition]) {
        targetULD = updated[basePosition];
      }

      if (targetULD) {
        targetULD.locks[lockIndex] = {
          ...targetULD.locks[lockIndex],
          engaged: engaged,
          lastCheck: new Date()
        };

        const engagedCount = targetULD.locks.filter(lock => lock.engaged).length;
        if (engagedCount === 4) {
          targetULD.overallStatus = 'engaged';
        } else if (engagedCount === 0) {
          targetULD.overallStatus = 'disengaged';
        } else {
          targetULD.overallStatus = 'partial';
        }
      }

      return updated;
    });
  }, []);

  // Connect to Arduino via USB Serial
  const connectToArduino = useCallback(async () => {
    // Check if Web Serial API is supported
    if (!('serial' in navigator)) {
      setConnectionError('Web Serial API not supported. Use Chrome, Edge, or Opera.');
      setConnectionStatus('error');
      return;
    }

    setConnectionStatus('connecting');
    setConnectionError('');

    try {
      // Request a port from the user
      const port = await navigator.serial.requestPort();

      // Open the port with the specified baud rate
      await port.open({ baudRate: parseInt(baudRate) });

      portRef.current = port;
      setConnectionStatus('connected');
      console.log('Connected to Arduino via USB Serial');

      // Start reading from the serial port
      const decoder = new TextDecoderStream();
      readableStreamClosedRef.current = port.readable.pipeTo(decoder.writable);
      const inputStream = decoder.readable;
      readerRef.current = inputStream.getReader();

      let buffer = '';

      // Read loop
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await readerRef.current.read();
            if (done) {
              break;
            }

            buffer += value;
            console.log('Raw data received:', value);  // DEBUG: show all incoming data

            // Process complete lines (JSON objects end with newline)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                  const data = JSON.parse(trimmed);
                  processSensorData(data);
                } catch (e) {
                  console.log('Non-JSON line:', trimmed);
                }
              }
            }
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error('Read error:', error);
            setConnectionError(`Read error: ${error.message}`);
            setConnectionStatus('error');
          }
        }
      };

      readLoop();

    } catch (error) {
      if (error.name === 'NotFoundError') {
        setConnectionError('No port selected. Please try again.');
      } else {
        setConnectionError(`Failed to connect: ${error.message}`);
      }
      setConnectionStatus('error');
      console.error('Connection error:', error);
    }
  }, [baudRate, processSensorData]);

  // Disconnect from Arduino
  const disconnectFromArduino = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }

      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current.catch(() => {});
        readableStreamClosedRef.current = null;
      }

      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }

    setConnectionStatus('disconnected');
    setLastSensorData(null);
    console.log('Disconnected from Arduino');
  }, []);

  const ConfigurationView = () => (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <Plane className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Boeing 777F Lock Detection System</h1>
              <p className="text-gray-600">USB Serial Connection - Select Aircraft Configuration</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Cable className="h-4 w-4" />
            <span>Wired USB connection to Arduino Uno Wi-Fi Rev4</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(positionLayouts).map(([key, config]) => (
            <div
              key={key}
              onClick={() => startMonitoring(key)}
              className="bg-white p-6 rounded-lg shadow-md border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg cursor-pointer transition-all"
            >
              <h3 className="font-bold text-lg text-gray-900 mb-2">{config.name}</h3>
              <p className="text-sm text-gray-600 mb-4">{config.description}</p>
              <div className="text-blue-600 font-medium text-sm">
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
    const activeAlerts = Object.entries(uldStatuses).filter(([_, status]) =>
      status.overallStatus !== 'engaged'
    );

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  disconnectFromArduino();
                  setCurrentView('configuration');
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Lock Status Monitor</h1>
                <p className="text-sm text-gray-600">{layout.name} - USB Serial</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                }`}></div>
                <span className="text-sm font-medium">
                  {connectionStatus === 'connected' ? 'USB Connected' :
                   connectionStatus === 'connecting' ? 'Connecting...' :
                   connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
                </span>
              </div>
              <button
                onClick={() => setCurrentView('report')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <FileText className="h-4 w-4" />
                <span>Flight Report</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
                  Active Alerts
                </h2>

                {activeAlerts.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">All Locks Secured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeAlerts.map(([position, status]) => (
                      <div
                        key={position}
                        className="p-3 bg-red-50 border border-red-200 rounded-lg cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          setSelectedULD(position);
                          setCurrentView('detail');
                        }}
                      >
                        <div className="font-semibold text-red-900">ULD {position}</div>
                        <div className="text-sm text-red-700">
                          {status.overallStatus === 'partial' ? 'Partial Lock Failure' : 'All Locks Disengaged'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* USB Serial Connection Panel */}
              <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  {connectionStatus === 'connected' ? (
                    <Cable className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Unplug className="h-4 w-4 mr-2 text-gray-400" />
                  )}
                  USB Serial Connection
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Baud Rate</label>
                    <select
                      value={baudRate}
                      onChange={(e) => setBaudRate(e.target.value)}
                      disabled={connectionStatus === 'connected'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    >
                      <option value="9600">9600</option>
                      <option value="19200">19200</option>
                      <option value="38400">38400</option>
                      <option value="57600">57600</option>
                      <option value="115200">115200</option>
                    </select>
                  </div>

                  {connectionError && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      {connectionError}
                    </div>
                  )}

                  {!('serial' in navigator) && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      Web Serial API not supported. Use Chrome, Edge, or Opera.
                    </div>
                  )}

                  {connectionStatus === 'connected' ? (
                    <button
                      onClick={disconnectFromArduino}
                      className="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center justify-center space-x-2"
                    >
                      <Unplug className="h-4 w-4" />
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      onClick={connectToArduino}
                      disabled={connectionStatus === 'connecting' || !('serial' in navigator)}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-400 flex items-center justify-center space-x-2"
                    >
                      <Cable className="h-4 w-4" />
                      <span>{connectionStatus === 'connecting' ? 'Connecting...' : 'Connect USB'}</span>
                    </button>
                  )}

                  {lastSensorData && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                      <div className="font-semibold text-gray-700 mb-1">Last Sensor Data:</div>
                      <div className="text-gray-600">
                        ULD: {lastSensorData.uldPosition} |
                        Lock: {lockPositions[lastSensorData.lockIndex]} |
                        State: {lastSensorData.engaged ? 'Engaged' : 'Disengaged'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Cargo Deck Status</h2>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10B981' }}></div>
                      <span>Engaged</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#F59E0B' }}></div>
                      <span>Partial</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#EF4444' }}></div>
                      <span>Disengaged</span>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 pointer-events-none opacity-10">
                    <svg className="w-full h-full" viewBox="0 0 800 200">
                      <path
                        d="M 50 100 Q 50 70 80 70 L 720 70 Q 750 70 750 100 Q 750 130 720 130 L 80 130 Q 50 130 50 100 Z"
                        stroke="#374151"
                        strokeWidth="3"
                        fill="none"
                      />
                    </svg>
                  </div>

                  <div className="relative z-10 space-y-3 p-4">
                    {layout.positions.map((row, rowIndex) => (
                      <div
                        key={`row-${rowIndex}`}
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(${layout.gridCols}, 1fr)` }}
                      >
                        {row.map((position, colIndex) => {
                          if (!position) return <div key={`empty-${colIndex}`} className="min-h-20"></div>;

                          const status = uldStatuses[position];
                          if (!status) return null;

                          const colors = getStatusColor(status.overallStatus);
                          const hasSensor = lastSensorData && position === lastSensorData.uldPosition;

                          return (
                            <div
                              key={position}
                              className="relative border-2 rounded-lg p-3 min-h-20 flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-lg"
                              style={{
                                backgroundColor: colors.bg + '20',
                                borderColor: colors.border
                              }}
                              onClick={() => {
                                setSelectedULD(position);
                                setCurrentView('detail');
                              }}
                            >
                              {hasSensor && (
                                <div className="absolute top-1 right-1">
                                  <Radio className="h-3 w-3 text-blue-600" />
                                </div>
                              )}

                              <div className="font-bold text-base" style={{ color: colors.text }}>
                                {position}
                              </div>

                              <div className="flex items-center space-x-1 mt-1">
                                {status.overallStatus === 'engaged' ? (
                                  <CheckCircle className="h-4 w-4" style={{ color: colors.border }} />
                                ) : (
                                  <AlertTriangle className="h-4 w-4" style={{ color: colors.border }} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex justify-between text-sm text-gray-500 px-4">
                    <span>AFT</span>
                    <span>FORWARD</span>
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
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('monitoring')}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">ULD {selectedULD} - Lock Details</h1>
                <p className="text-sm text-gray-600">Individual Lock Status</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="grid grid-cols-2 gap-6">
              {status.locks.map((lock, index) => {
                const isActiveSensor = lastSensorData && selectedULD === lastSensorData.uldPosition && index === lastSensorData.lockIndex;
                const colors = getStatusColor(lock.engaged ? 'engaged' : 'disengaged');

                return (
                  <div
                    key={index}
                    className={`p-6 rounded-lg border-2 ${isActiveSensor ? 'ring-4 ring-blue-400' : ''}`}
                    style={{
                      backgroundColor: colors.bg + '20',
                      borderColor: colors.border
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg text-gray-900">{lock.position}</h3>
                      {isActiveSensor && (
                        <div className="flex items-center space-x-1 text-blue-600 text-sm font-medium">
                          <Radio className="h-4 w-4" />
                          <span>Sensor</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 mb-4">
                      {lock.engaged ? (
                        <CheckCircle className="h-8 w-8" style={{ color: colors.border }} />
                      ) : (
                        <AlertTriangle className="h-8 w-8" style={{ color: colors.border }} />
                      )}
                      <div>
                        <div className="font-semibold text-xl" style={{ color: colors.text }}>
                          {lock.engaged ? 'ENGAGED' : 'DISENGAGED'}
                        </div>
                        <div className="text-sm text-gray-600">
                          Status: {lock.engaged ? '1' : '0'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="h-4 w-4 mr-2" />
                        Last Check: {lock.lastCheck.toLocaleTimeString()}
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

    let csvContent = "Boeing 777F Lock Detection System - Flight Report (USB Serial)\n";
    csvContent += `Generated: ${new Date().toLocaleString()}\n`;
    csvContent += `Configuration: ${positionLayouts[selectedLayout].name}\n`;
    csvContent += `Flight Duration: ${hours}h ${minutes}m ${seconds}s\n`;
    csvContent += `Total Events: ${flightLog.length}\n`;
    csvContent += `Engagements: ${engagementCount}\n`;
    csvContent += `Disengagements: ${disengagementCount}\n`;
    csvContent += `\n`;

    csvContent += "Timestamp,ULD Position,Lock Position,Event,Value\n";

    flightLog.forEach(log => {
      const timestamp = log.timestamp.toLocaleString();
      csvContent += `"${timestamp}",${log.uldPosition},${log.lockPosition},${log.event},${log.value}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const filename = `Boeing777F_Flight_Report_USB_${new Date().toISOString().slice(0, 10)}_${new Date().getTime()}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
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
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('monitoring')}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Flight Report</h1>
                <p className="text-sm text-gray-600">Lock Engagement History (USB Serial)</p>
              </div>
            </div>

            <button
              onClick={exportReport}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Flight Duration</div>
              <div className="text-2xl font-bold text-gray-900">{hours}h {minutes}m</div>
            </div>
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Total Events</div>
              <div className="text-2xl font-bold text-gray-900">{flightLog.length}</div>
            </div>
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Engagements</div>
              <div className="text-2xl font-bold text-green-600">{engagementCount}</div>
            </div>
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Disengagements</div>
              <div className="text-2xl font-bold text-red-600">{disengagementCount}</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Event Timeline</h2>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ULD Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lock Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {flightLog.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                        No events recorded
                      </td>
                    </tr>
                  ) : (
                    flightLog.slice().reverse().map((log, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.timestamp.toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {log.uldPosition}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {log.lockPosition}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            log.event === 'ENGAGED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {log.event}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.value}
                        </td>
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
      {currentView === 'monitoring' && <MonitoringView />}
      {currentView === 'detail' && <DetailView />}
      {currentView === 'report' && <ReportView />}
    </>
  );
};

export default LockDetectionSystem;
