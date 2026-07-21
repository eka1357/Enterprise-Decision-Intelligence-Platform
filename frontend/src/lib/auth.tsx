import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import api from "./api";

interface AuthUser {
  id: string;
  email: string;
  full_name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides authentication state and methods to the component tree.
 * Persists JWT in localStorage and auto-redirects on login/logout.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("edip_token")
  );
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      setIsLoading(false);
      setUser({ id: "", email: "", full_name: "" });
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post("/auth/login", { email, password });
    const { access_token } = response.data;
    localStorage.setItem("edip_token", access_token);
    setToken(access_token);
    setUser({ id: "", email, full_name: "" });
    navigate("/");
  }, [navigate]);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const response = await api.post("/auth/register", {
      email,
      password,
      full_name: fullName,
    });
    setUser(response.data);
    // After registration, auto-login
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem("edip_token");
    setToken(null);
    setUser(null);
    navigate("/login");
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!token,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication state and methods.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
