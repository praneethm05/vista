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
import { JoinTeam } from './pages/JoinTeam';
import { TeamPage } from './pages/TeamPage';

function RoleRoutes() {
  const { me } = useMe();
  const approver = me.role !== 'EMPLOYEE';
  const needsTeam = me.role === 'EMPLOYEE' && !me.managerId;
  const home = me.role === 'ADMIN' || me.role === 'MANAGER' ? '/approvals' : '/';
  return (
    <Routes>
      <Route element={<Shell />}>
        {needsTeam ? (
          <Route path="/" element={<JoinTeam />} />
        ) : me.role !== 'ADMIN' && (
          <>
            <Route path="/" element={<MyLeave />} />
            <Route path="/apply" element={<ApplyLeave />} />
          </>
        )}
        <Route path="/leaves/:id" element={<RequestDetail />} />
        {approver && <Route path="/approvals" element={<Approvals />} />}
        {approver && <Route path="/approvals/:id" element={<ApprovalDetail />} />}
        {me.role === 'MANAGER' && <Route path="/team" element={<TeamPage />} />}
        {me.role === 'ADMIN' && <Route path="/people" element={<TeamPage />} />}
        {me.role === 'ADMIN' && <Route path="/audit" element={<AuditPage />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
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
