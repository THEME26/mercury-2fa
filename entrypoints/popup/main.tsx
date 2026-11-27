import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initLanguage } from '../../lib/i18n/preference';
import App from './App';
import './style.css';

/** 先定语言再挂载，避免第一帧英文闪成中文 */
void initLanguage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
