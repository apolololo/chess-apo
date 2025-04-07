import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const renderApp = async () => {
  // Delay the import to allow the Vite server to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Dynamically import the script
  try {
    const script = document.createElement('script');
    script.src = 'https://cdn.gpteng.co/gptengineer.js';
    script.type = 'module';
    document.body.appendChild(script);
  } catch (error) {
    console.error('Failed to load gptengineer.js', error);
  }

  createRoot(document.getElementById("root")!).render(<App />);
};

renderApp();