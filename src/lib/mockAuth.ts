export interface User {
  id: string;
  email: string;
  name?: string;
}

const STORAGE_KEY = 'vistro_user';

export const mockAuth = {
  signIn: async (email: string): Promise<User> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const user: User = {
      id: crypto.randomUUID(),
      email,
      name: email.split('@')[0],
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return user;
  },

  signInWithGoogle: async (): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const user: User = {
      id: crypto.randomUUID(),
      email: 'demo@example.com',
      name: 'Demo User',
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return user;
  },

  signOut: async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEY);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  isAuthenticated: (): boolean => {
    return !!mockAuth.getCurrentUser();
  },
};
