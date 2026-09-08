import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { apiClient } from '../services/apiClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { username: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resetPassword: (data: { token: string; newPassword: string }) => Promise<{ message: string; user?: User }>;
  changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<{ message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const token = apiClient.getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiClient.getMe();
      setUser(res.user);
    } catch (err) {
      console.warn('[Auth] Token invalid or expired, resetting session.');
      apiClient.setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (identifier: string, password: string) => {
    const res = await apiClient.login({ identifier, password });
    setUser(res.user);
  };

  const register = async (data: { username: string; email: string; password: string; displayName?: string }) => {
    const res = await apiClient.register(data);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
    }
  };

  const resetPassword = async (data: { token: string; newPassword: string }) => {
    const res = await apiClient.resetPassword(data);
    if (res.data?.user) {
      setUser(res.data.user);
    }
    return { message: res.message, user: res.data?.user };
  };

  const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
    return await apiClient.changePassword(data);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        resetPassword,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
