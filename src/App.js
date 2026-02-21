import React, { useState } from 'react';
import { Plane, Cable, Wifi, FlaskConical } from 'lucide-react';
import DemoMode from './modes/Demo';
import USBMode from './modes/USB';
import WirelessMode from './modes/Wireless';

const MODES = [
  {
    id: 'usb',
    label: 'USB',
    description: 'Wired Arduino via USB Serial',
    icon: Cable,
  },
  {
    id: 'wireless',
    label: 'Wireless',
    description: 'Arduino via Wi-Fi WebSocket',
    icon: Wifi,
  },
  {
    id: 'demo',
    label: 'Demo',
    description: 'Simulation (no hardware)',
    icon: FlaskConical,
  },
];

const App = () => {
  const [activeMode, setActiveMode] = useState('usb');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Mode selector bar */}
      <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-2">
          <Plane className="h-5 w-5 text-blue-400" />
          <span className="font-semibold text-sm tracking-wide">Boeing 777F Lock System</span>
        </div>

        <div className="flex items-center space-x-1">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveMode(id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                activeMode === id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active mode */}
      <div className="flex-1">
        {activeMode === 'usb' && <USBMode />}
        {activeMode === 'wireless' && <WirelessMode />}
        {activeMode === 'demo' && <DemoMode />}
      </div>
    </div>
  );
};

export default App;
