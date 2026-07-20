import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { App as AntApp, Spin } from 'antd'
import { AppShell } from './app/AppShell'
import { PrototypeProvider } from './app/PrototypeContext'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const AiAnalysisPage = lazy(() => import('./pages/AiAnalysisPage').then((module) => ({ default: module.AiAnalysisPage })))
const SitesPage = lazy(() => import('./pages/SitesPage').then((module) => ({ default: module.SitesPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })))
const ExecutionsPage = lazy(() => import('./pages/ExecutionsPage').then((module) => ({ default: module.ExecutionsPage })))
const FailuresPage = lazy(() => import('./pages/FailuresPage').then((module) => ({ default: module.FailuresPage })))
const ArticlesPage = lazy(() => import('./pages/ArticlesPage').then((module) => ({ default: module.ArticlesPage })))
const CapabilitiesPage = lazy(() => import('./pages/CapabilitiesPage').then((module) => ({ default: module.CapabilitiesPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

function LoadingPage() {
  return <div className="route-loading"><Spin size="small" /><span>正在加载工作区</span></div>
}

export default function App() {
  return (
    <AntApp>
      <PrototypeProvider>
        <Suspense fallback={<LoadingPage />}>
          <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="ai" element={<AiAnalysisPage />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="rules" element={<Navigate to="/sites" replace />} />
            <Route path="rules/:ruleId" element={<Navigate to="/sites" replace />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="executions" element={<ExecutionsPage />} />
            <Route path="executions/:executionId" element={<ExecutionsPage />} />
            <Route path="failures" element={<FailuresPage />} />
            <Route path="articles" element={<ArticlesPage />} />
            <Route path="articles/:articleId" element={<ArticlesPage />} />
            <Route path="capabilities" element={<CapabilitiesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          </Routes>
        </Suspense>
      </PrototypeProvider>
    </AntApp>
  )
}
