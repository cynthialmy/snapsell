/**
 * SnapSell - Authentication Context
 *
 * Provides global authentication state management.
 */

import { getUser, onAuthStateChange, type User } from '@/utils/auth';
import { migrateLocalListingsToBackend } from '@/utils/listings-api';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const { user: currentUser, error } = await getUser();
      // Only set user if we got one, or if error is just "no session" (which is normal)
      if (currentUser) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
    } catch (error: any) {
      // Don't log session missing errors - they're expected when not authenticated
      if (error?.name !== 'AuthSessionMissingError' && error?.message !== 'Auth session missing!') {
        console.error('Error refreshing user:', error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    refreshUser();

    // Listen to auth state changes
    const { data: { subscription } } = onAuthStateChange(async (user) => {
      setUser(user);
      setLoading(false);

      // Migrate local listings to backend when user signs in
      if (user) {
        // Run migration in background (don't block UI)
        migrateLocalListingsToBackend().then((result) => {
          if (result.error && !result.skipped) {
            console.warn('Migration completed with some errors:', result);
          } else if (result.migrated > 0) {
            console.log(`Successfully migrated ${result.migrated} listing(s) to backend`);
          }
        }).catch((error) => {
          console.error('Migration error:', error);
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
