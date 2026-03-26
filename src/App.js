import React, { useState, useEffect } from 'react';
import { Cable, Wifi, FlaskConical, Sun, Moon } from 'lucide-react';
import DemoMode from './modes/Demo';
import USBMode from './modes/USB';
import WirelessMode from './modes/Wireless';
import ViewerMode from './modes/Viewer';

const isViewerMode = new URLSearchParams(window.location.search).get('mode') === 'viewer';

const MODES = [
  { id: 'usb',      label: 'USB',      icon: Cable },
  { id: 'wireless', label: 'Wireless', icon: Wifi },
  { id: 'demo',     label: 'Demo',     icon: FlaskConical },
];

const App = () => {
  const [activeMode, setActiveMode] = useState('usb');
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  if (isViewerMode) return <ViewerMode />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
      {/* Top bar */}
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm z-10">
        <div className="px-4 py-3 flex items-center justify-between gap-4">

          {/* Left: Co-branding */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Gonzaga pill */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="bg-[#003D79] text-white text-xs font-bold px-2 py-1 rounded">
                GU
              </span>
              <span className="hidden sm:block text-sm font-semibold text-[#003D79] dark:text-blue-300">
                Gonzaga University
              </span>
            </div>

            <span className="text-gray-300 dark:text-slate-600 font-light text-lg select-none">×</span>

            {/* Boeing wordmark */}
            <span className="text-[#1D4ED8] dark:text-blue-400 font-bold text-sm tracking-widest shrink-0">
              BOEING
            </span>

            {/* Badge */}
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shrink-0">
              Proof of Concept
            </span>
          </div>

          {/* Right: Mode tabs + theme toggle */}
          <div className="flex items-center gap-1 shrink-0">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeMode === id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}

            {/* Divider */}
            <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-1" />

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              className="p-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Active mode */}
      <div className="flex-1">
        {activeMode === 'usb'      && <USBMode />}
        {activeMode === 'wireless' && <WirelessMode />}
        {activeMode === 'demo'     && <DemoMode />}
      </div>
    </div>
  );
};

export default App;
