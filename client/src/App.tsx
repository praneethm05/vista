import { Navigate, Route, Routes } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { MeProvider, useMe } from './lib/me';
import { Shell } from './components/Shell';
import { ErrorState, Spinner } from './components/ui';
import { SignInPage } from './pages/SignInPage';
import { MyLeave } from './pages/MyLeave';
import { ApplyLeave } from './pages/ApplyLeave';
import { RequestDetail } from './pages/RequestDetail';
import { Approvals } from './pages/Approvals';
import { ApprovalDetail } from './pages/ApprovalDetail';
import { AuditPage } from './pages/AuditPage';

function RoleRoutes() {
  const { me } = useMe();
  const approver = me.role !== 'EMPLOYEE';
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<MyLeave />} />
        <Route path="/apply" element={<ApplyLeave />} />
        <Route path="/leaves/:id" element={<RequestDetail />} />
        {approver && <Route path="/approvals" element={<Approvals />} />}
        {approver && <Route path="/approvals/:id" element={<ApprovalDetail />} />}
        {me.role === 'HOD' && <Route path="/audit" element={<AuditPage />} />}
        <Route path="*" element={<Navigate to={approver ? '/approvals' : '/'} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <SignedOut><SignInPage /></SignedOut>
      <SignedIn>
        <MeProvider
          fallback={<div className="grid min-h-dvh place-items-center"><Spinner label="Getting your workspace ready…" /></div>}
          error={(msg, retry) => <div className="mx-auto max-w-md p-8"><ErrorState message={msg} onRetry={retry} /></div>}
        >
          <RoleRoutes />
        </MeProvider>
      </SignedIn>
    </>
  );
}
