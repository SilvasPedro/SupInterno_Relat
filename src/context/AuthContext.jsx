/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null); 
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Busca o colaborador no banco pelo email que logou
                    const q = query(collection(db, "collaborators"), where("email", "==", user.email));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        const colabDoc = querySnapshot.docs[0];
                        const colabData = colabDoc.data();
                        
                        // Define quem é admin baseado no cargo
                        const role = colabData.role?.toLowerCase() || '';
                        if (role.includes('admin') || role.includes('gestor') || role.includes('supervisor')) {
                            setUserRole('admin');
                        } else {
                            setUserRole('colab');
                        }
                        
                        // Salva os dados logados passando o ID do banco (firestoreId)
                        setCurrentUser({ ...user, firestoreId: colabDoc.id, ...colabData });
                    } else {
                        // Se for uma conta master que criou o firebase mas não tá na tabela de equipe
                        setUserRole('admin');
                        setCurrentUser({ ...user, firestoreId: user.uid });
                    }
                } catch (error) {
                    console.error("Erro ao buscar perfil:", error);
                    setUserRole('colab'); // Por segurança, se der erro ele vai pra visão restrita
                    setCurrentUser(user);
                }
            } else {
                // Ninguém logado
                setCurrentUser(null);
                setUserRole(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser, userRole, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);