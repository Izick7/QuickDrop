import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../context/AuthContext';
import LandingPage from '../pages/LandingPage';
import AuthPage from '../pages/AuthPage';
import DashboardPage from '../pages/DashboardPage';
import { CreateDeliveryPage, DeliveryDetailPage, DeliveryListPage } from '../pages/DeliveryPages';
import { AdminUsersPage, AvailablePage, PaymentsPage, ProfilePage, RidersPage } from '../pages/WorkspacePages';
import ProtectedRoute from './ProtectedRoute';
function AuthEntry({mode}){const {user,loading}=useAuth();if(loading)return <div className="route-loading"><span className="spin-mark">Q</span></div>;if(user)return <Navigate to="/app" replace/>;return <AuthPage mode={mode}/>;}
export default function AppRoutes(){return <Routes><Route path="/" element={<LandingPage/>}/><Route path="/login" element={<AuthEntry mode="login"/>}/><Route path="/register" element={<AuthEntry mode="register"/>}/><Route element={<ProtectedRoute/>}><Route path="/app" element={<AppLayout/>}><Route index element={<DashboardPage/>}/><Route path="deliveries" element={<DeliveryListPage/>}/><Route path="deliveries/:id" element={<DeliveryDetailPage/>}/><Route element={<ProtectedRoute roles={['CUSTOMER']}/> }><Route path="new" element={<CreateDeliveryPage/>}/></Route><Route element={<ProtectedRoute roles={['CUSTOMER','ADMIN']}/> }><Route path="payments" element={<PaymentsPage/>}/></Route><Route element={<ProtectedRoute roles={['CUSTOMER','RIDER']}/> }><Route path="profile" element={<ProfilePage/>}/></Route><Route element={<ProtectedRoute roles={['RIDER']}/> }><Route path="available" element={<AvailablePage/>}/></Route><Route element={<ProtectedRoute roles={['ADMIN']}/> }><Route path="users" element={<AdminUsersPage/>}/><Route path="riders" element={<RidersPage/>}/></Route></Route></Route><Route path="*" element={<NotFound/>}/></Routes>;}
function NotFound(){return <div className="not-found"><span className="eyebrow">404 · NOT FOUND</span><h1>This page took a wrong turn.</h1><p>The address may have changed or the page may no longer be available.</p><a className="button button-orange" href="/">Back to QuickDrop</a></div>}
