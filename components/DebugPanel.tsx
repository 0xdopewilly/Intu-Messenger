import React, { useState } from 'react';
import { Settings2, X, AlertTriangle, ShieldAlert, MessageCircle } from 'lucide-react';
import { TrustSettings } from '../types';
import { messagingService } from '../services/messagingService';

interface DebugPanelProps {
  trustSettings: TrustSettings;
  updateTrustSettings: (s: TrustSettings) => void;
  mockTrustScore: number;
  setMockTrustScore: (n: number) => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ 
  trustSettings, 
  updateTrustSettings, 
  mockTrustScore, 
  setMockTrustScore 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const simulateIncoming = () => {
      messagingService.simulateIncomingMessage('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'Hey! This is a test message to check unread badges.');
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-red-600 text-white p-3 rounded-full shadow-lg hover:bg-red-700 transition-colors z-50"
      >
        <Settings2 size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <ShieldAlert size={18} className="text-yellow-500"/> 
          Debug Simulation
        </h3>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-400 uppercase font-bold">Simulate My Trust Score</label>
          <div className="flex items-center gap-2 mt-1">
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={mockTrustScore} 
              onChange={(e) => setMockTrustScore(Number(e.target.value))}
              className="w-full accent-indigo-500" 
            />
            <span className="text-white font-mono w-8">{mockTrustScore}</span>
          </div>
        </div>

        <div className="h-px bg-slate-800" />

        <div>
          <label className="text-xs text-slate-400 uppercase font-bold">Min Score to DM Me</label>
          <div className="flex items-center gap-2 mt-1">
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={trustSettings.minTrustScore} 
              onChange={(e) => updateTrustSettings({...trustSettings, minTrustScore: Number(e.target.value)})}
              className="w-full accent-emerald-500" 
            />
            <span className="text-white font-mono w-8">{trustSettings.minTrustScore}</span>
          </div>
        </div>

        <div>
           <button onClick={simulateIncoming} className="w-full py-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 rounded hover:bg-indigo-500/30 flex items-center justify-center gap-2 text-sm font-bold">
               <MessageCircle size={16} /> Simulate Message
           </button>
        </div>

        <div className="bg-yellow-900/20 p-2 rounded border border-yellow-900/50 flex items-start gap-2 mt-2">
          <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
          <p className="text-xs text-yellow-500">
            Changes here apply immediately to filtering logic for incoming messages and requests.
          </p>
        </div>
      </div>
    </div>
  );
};