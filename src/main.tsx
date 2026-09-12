import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Ponto de entrada principal da aplicação
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

// Verifica se já foi renderizado (previne crash no Vite HMR)
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
