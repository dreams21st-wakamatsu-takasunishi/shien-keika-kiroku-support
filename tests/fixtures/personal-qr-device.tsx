import React from 'react';
import { createRoot } from 'react-dom/client';
import { PersonalStaffQr } from '../../src/components/AttendanceQr';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="min-h-screen bg-slate-100 p-4"><PersonalStaffQr currentUser={{id:'11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222',displayName:'架空職員',role:'manager',loginMethod:'email',recorderProfileId:'44444444-4444-4444-8444-444444444444'}}/></main></React.StrictMode>);
