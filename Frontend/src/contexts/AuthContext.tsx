import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type User } from "oidc-client-ts";
import { userManager, login, logout } from "@/lib/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login,
  logout,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load current user from sessionStorage on mount
    userManager.getUser().then((u) => {
      setUser(u);
      setIsLoading(false);
    });

    // Keep state in sync with UserManager events
    const onLoaded = (u: User | null) => setUser(u);
    const onUnloaded = () => setUser(null);
    const onExpired = () => login();
    const onSilentRenewError = () => login();

    userManager.events.addUserLoaded(onLoaded);
    userManager.events.addUserUnloaded(onUnloaded);
    userManager.events.addAccessTokenExpired(onExpired);
    userManager.events.addSilentRenewError(onSilentRenewError);

    return () => {
      userManager.events.removeUserLoaded(onLoaded);
      userManager.events.removeUserUnloaded(onUnloaded);
      userManager.events.removeAccessTokenExpired(onExpired);
      userManager.events.removeSilentRenewError(onSilentRenewError);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user && !user.expired,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
