/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/purity */
import React, { createContext, useContext, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 5000); // Remove após 5 segundos
  };

  const removeToast = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showToast }}>
      {children}
      {/* Container dos Toasts */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-3">
        {notifications.map((n) => (
          <div 
            key={n.id} 
            className={`flex items-center gap-3 p-4 rounded-lg shadow-2xl border min-w-[300px] animate-in slide-in-from-right-full duration-300 ${
              n.type === 'success' ? 'bg-white border-green-100 text-green-800' : 
              n.type === 'error' ? 'bg-white border-red-100 text-red-800' : 
              'bg-zinc-900 border-zinc-800 text-white'
            }`}
          >
            {n.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {n.type === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
            {n.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            
            <p className="flex-1 text-sm font-medium">{n.message}</p>
            
            <button onClick={() => removeToast(n.id)} className="opacity-50 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);