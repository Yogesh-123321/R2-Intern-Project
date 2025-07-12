import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardView from './pages/DashboardView';
import AdminDashboard from './pages/AdminDashboard';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* ✅ Authenticated User Dashboard */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute allowedRoles={['user', 'block', 'gp']}>
              <DashboardView />
            </PrivateRoute>
          }
        />

        {/* ✅ Admin Dashboard */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </PrivateRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
