import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/Feedback';
export default function ProtectedRoute({ roles }) { const { user, loading } = useAuth(); if (loading) return <div className="route-loading"><Loading/></div>; if (!user) return <Navigate to="/login" replace/>; if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace/>; return <Outlet/>; }
