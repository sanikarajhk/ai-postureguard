import { create } from 'zustand';
import api from '../api/axios.js';

const TOKEN_KEY = 'postureguard_token';

export const useAuthStore = create((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null,
  user: null,
  isAuthenticated: typeof window !== 'undefined' ? Boolean(localStorage.getItem(TOKEN_KEY)) : false,
  isLoading: false,
  isInitialized: false,
  error: null,

  // Set error
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // User Registration
  register: async ({ name, email, password }) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/register', { name, email, password });
      const { token, user } = res.data;

      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        set({
          token,
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        return { success: true, user, token };
      }

      set({ isLoading: false });
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        'Registration failed. Please check your details and try again.';
      set({ error: message, isLoading: false });
      return { success: false, error: message };
    }
  },

  // User Login
  login: async ({ email, password }) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;

      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        set({
          token,
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        return { success: true, user, token };
      }

      set({ isLoading: false });
      return { success: false, error: 'No token received from server.' };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        'Unable to sign in. Please verify your email and password.';
      set({ error: message, isLoading: false });
      return { success: false, error: message };
    }
  },

  // Fetch current user from /api/auth/me to restore session on page refresh
  loadUser: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const res = await api.get('/auth/me');
      set({
        user: res.data.user,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        error: null
      });
    } catch (err) {
      console.warn('Session restoration failed:', err.response?.data?.message || err.message);
      localStorage.removeItem(TOKEN_KEY);
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false
      });
    }
  },

  // Logout
  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.warn('Failed to remove token from localStorage:', e);
    }
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      error: null
    });
  },

  // Update User Settings (saved to MongoDB)
  updateUserSettings: async ({ alertAfterSeconds, breakEveryMinutes }) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.patch('/auth/settings', { alertAfterSeconds, breakEveryMinutes });
      const updatedSettings = res.data.settings;
      set((state) => ({
        user: state.user ? { ...state.user, settings: updatedSettings } : null,
        isLoading: false,
        error: null
      }));
      return { success: true, settings: updatedSettings };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update user settings.';
      set({ error: message, isLoading: false });
      return { success: false, error: message };
    }
  }
}));

// Listen for global 401 unauthorized event from axios interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    useAuthStore.getState().logout();
  });
}
