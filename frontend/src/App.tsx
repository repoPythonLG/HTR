import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { ProtectedRoute } from './layout/ProtectedRoute'
import { AdvancedSectionsPage } from './pages/AdvancedSectionsPage'
import { AdminConsolePage } from './pages/AdminConsolePage'
import { ClaimAnalysisPage } from './pages/ClaimAnalysisPage'
import { ClaimsWorkbenchPage } from './pages/ClaimsWorkbenchPage'
import { DataIntakePage } from './pages/DataIntakePage'
import { EmployeeRiskInsightsPage } from './pages/EmployeeRiskInsightsPage'
import { EmployeeViewPage } from './pages/EmployeeViewPage'
import { ExecutiveDashboardPage } from './pages/ExecutiveDashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ModelGovernancePage } from './pages/ModelGovernancePage'
import { OutlierAnalyticsPage } from './pages/OutlierAnalyticsPage'
import { ProcessedClaimsHistoryPage } from './pages/ProcessedClaimsHistoryPage'
import { SpreadsheetViewerPage } from './pages/SpreadsheetViewerPage'
import { useAuth } from './context/AuthContext'

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'employee' ? '/employee' : '/receipts'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route element={<ProtectedRoute allowedRoles={['reviewer', 'administrator']} />}>
            <Route path="dashboard" element={<ExecutiveDashboardPage />} />
            <Route path="claims" element={<Navigate to="/receipts" replace />} />
            <Route path="receipts" element={<ClaimsWorkbenchPage />} />
            <Route path="intake" element={<DataIntakePage />} />
            <Route path="intake/spreadsheet" element={<SpreadsheetViewerPage />} />
            <Route path="claims/:claimId/analysis" element={<ClaimAnalysisPage />} />
            <Route path="receipts/:receiptId/analysis" element={<ClaimAnalysisPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['reviewer', 'administrator']} />}>
            <Route path="advanced" element={<AdvancedSectionsPage />} />
            <Route path="employee-insights" element={<EmployeeRiskInsightsPage />} />
            <Route path="outliers" element={<OutlierAnalyticsPage />} />
            <Route path="history" element={<ProcessedClaimsHistoryPage />} />
            <Route path="governance" element={<ModelGovernancePage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['employee']} />}>
            <Route path="employee" element={<EmployeeViewPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['administrator']} />}>
            <Route path="admin" element={<AdminConsolePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
