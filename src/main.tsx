import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LivePortal from './LivePortal';
import { PORTAL_LIVE } from './live-api';
import './styles.css';
import './source-styles.css';
import './admin-workspace.css';
import './live-styles.css';
import './portal-refinements.css';
import './prime-admin.css';
import './announcements.css';
import './student-experience.css';
import './supervisor-experience.css';
import './portal-loading.css';
import './pagination.css';
import './resources-library.css';
import './login-animation.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{PORTAL_LIVE ? <LivePortal /> : <App />}</React.StrictMode>,
);
