import React, { useState, useEffect } from 'react';
import { Cable, FlaskConical } from 'lucide-react';
import DemoMode from './modes/Demo';
import USBMode from './modes/USB';
import ViewerMode from './modes/Viewer';

const isViewerMode = new URLSearchParams(window.location.search).get('mode') === 'viewer';

const MODES = [
  { id: 'usb',  label: 'USB MODE',  icon: Cable },
  { id: 'demo', label: 'DEMO MODE', icon: FlaskConical },
];

const App = () => {
  const [activeMode, setActiveMode] = useState('usb');

  useEffect(() => {
    // Force dark mode for aviation display
    document.documentElement.classList.add('dark');
  }, []);

  if (isViewerMode) return <ViewerMode />;

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0f1a] text-white font-mono">
      {/* Aviation-style header */}
      <header className="bg-[#0d1321] border-b-2 border-[#1e3a5f] shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between gap-4">

          {/* Left: System identification */}
          <div className="flex items-center gap-4">
            {/* Boeing identifier */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0066cc] rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#00d4ff] font-bold text-sm tracking-wider leading-none">
                  BOEING 777F
                </span>
                <span className="text-[#6b7280] text-xs tracking-wide">
                  CARGO LOCK DETECTION
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-[#1e3a5f]" />

            {/* Gonzaga identifier */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-[#003D79] text-white text-xs font-bold px-2 py-1 rounded">
                GU
              </span>
              <span className="text-[#6b7280] text-xs">
                GONZAGA ENGINEERING
              </span>
            </div>

            {/* Status badge */}
            <span className="hidden md:inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-[#1e3a5f] text-[#fbbf24] border border-[#fbbf24]/30 tracking-wider">
              POC v1.0
            </span>
          </div>

          {/* Right: Mode selector */}
          <div className="flex items-center gap-2">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveMode(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold tracking-wider transition-all ${
                  activeMode === id
                    ? 'bg-[#00d4ff] text-[#0a0f1a] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                    : 'bg-[#1e3a5f] text-[#6b7280] hover:text-white hover:bg-[#2d4a6f] border border-[#2d4a6f]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Active mode content */}
      <main className="flex-1">
        {activeMode === 'usb'  && <USBMode />}
        {activeMode === 'demo' && <DemoMode />}
      </main>

      {/* Aviation-style footer */}
      <footer className="bg-[#0d1321] border-t border-[#1e3a5f] px-4 py-2">
        <div className="flex items-center justify-between text-xs text-[#6b7280] font-mono">
          <span>EN26-55 CARGO LOCK MONITORING SYSTEM</span>
          <span className="hidden sm:block">GONZAGA UNIVERSITY × BOEING</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
