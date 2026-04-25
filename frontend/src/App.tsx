import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AppLayout } from './layout/AppLayout'
import { ProtectedRoute } from './layout/ProtectedRoute'
import { AdminConsolePage } from './pages/AdminConsolePage'
import { ClaimAnalysisPage } from './pages/ClaimAnalysisPage'
import { ClaimsWorkbenchPage } from './pages/ClaimsWorkbenchPage'
import { DataIntakePage } from './pages/DataIntakePage'
import { EmployeeRiskInsightsPage } from './pages/EmployeeRiskInsightsPage'
import { EmployeeViewPage } from './pages/EmployeeViewPage'
import { ExecutiveDashboardPage } from './pages/ExecutiveDashboardPage'
import { LoginPage } from './pages/LoginPage'
import { OutlierAnalyticsPage } from './pages/OutlierAnalyticsPage'
import { ProcessedClaimsHistoryPage } from './pages/ProcessedClaimsHistoryPage'
import { SpreadsheetViewerPage } from './pages/SpreadsheetViewerPage'

function LoginEntry() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }
  return <LoginPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginEntry />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<ExecutiveDashboardPage />} />
          <Route path="claims" element={<ClaimsWorkbenchPage />} />
          <Route path="intake" element={<DataIntakePage />} />
          <Route path="intake/spreadsheet" element={<SpreadsheetViewerPage />} />
          <Route path="claims/:claimId/analysis" element={<ClaimAnalysisPage />} />
          <Route element={<ProtectedRoute allowedRoles={['reviewer', 'administrator']} />}>
            <Route path="employee-insights" element={<EmployeeRiskInsightsPage />} />
            <Route path="outliers" element={<OutlierAnalyticsPage />} />
            <Route path="history" element={<ProcessedClaimsHistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['employee']} />}>
            <Route path="employee" element={<EmployeeViewPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['administrator']} />}>
            <Route path="admin" element={<AdminConsolePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
