import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { messaging } from './services/firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './services/firebase';

// Importação das páginas
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import CollaboratorDashboard from './pages/CollaboratorDashboard';

// ==========================================
// GERENCIADOR DE NOTIFICAÇÕES (Invisível)
// ==========================================
// ==========================================
// GERENCIADOR DE NOTIFICAÇÕES (Invisível)
// ==========================================
const NotificationManager = () => {
    const { currentUser } = useAuth();

    useEffect(() => {
        async function requestNotificationPermission() {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const token = await getToken(messaging, { 
                        vapidKey: 'BGK2ZQE-DyWlwEk00nwgXppWc8kmJfidnErECA81peK1iUHkgf32D_9NgXxL73N7mED68U1ZEzRvT43tGQ1x0Vg' 
                    });
                    
                    if (token) {
                        console.log('Token FCM gerado com sucesso:', token);
                        
                        if (currentUser.firestoreId) {
                            try {
                                await updateDoc(doc(db, 'collaborators', currentUser.firestoreId), {
                                    fcmToken: token
                                });
                                console.log('Token salvo no perfil do usuário com sucesso!');
                            } catch (e) {
                                console.error('Erro ao salvar token no banco:', e);
                            }
                        }
                    } else {
                        console.log('Nenhum token de registro disponível.');
                    }
                } else {
                    console.log('Permissão para notificações foi negada pelo usuário.');
                }
            } catch (error) {
                console.error('Erro ao pedir permissão para notificações:', error);
            }
        }

        if (currentUser) {
            requestNotificationPermission();
        }
    }, [currentUser]);

    return null; 
};

// ==========================================
// PROTEÇÃO DE ROTAS
// ==========================================
const PrivateRoute = ({ children, requiredRole }) => {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (requiredRole === 'Admin' && currentUser.role !== 'Admin') {
        return <Navigate to="/collaborator" replace />;
    }

    return children;
};

// ==========================================
// GERENCIADOR DE ROTAS (Filho do AuthProvider)
// ==========================================
const AppRoutes = () => {
    const { currentUser } = useAuth(); // Agora funciona perfeitamente!

    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Rota do Gestor */}
            <Route path="/admin/*" element={
                <PrivateRoute requiredRole="Admin">
                    <AdminDashboard />
                </PrivateRoute>
            } />
            
            {/* Rota do Colaborador */}
            <Route path="/collaborator/*" element={
                <PrivateRoute>
                    <CollaboratorDashboard currentUserId={currentUser?.firestoreId} />
                </PrivateRoute>
            } />

            {/* Redirecionamento Padrão */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
};

// ==========================================
// APP PRINCIPAL
// ==========================================
function App() {
    return (
        <NotificationProvider>
            <AuthProvider>
                <BrowserRouter>
                    <NotificationManager />
                    <AppRoutes /> {/* As rotas agora ficam aqui dentro */}
                </BrowserRouter>
            </AuthProvider>
        </NotificationProvider>
    );
}

export default App;