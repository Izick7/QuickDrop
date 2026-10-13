import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { login as apiLogin, me as apiMe, register as apiRegister } from '../api/auth';
import { setTokenReader, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);
const TOKEN_KEY = 'quickdrop_token';
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  setTokenReader(() => token);
  setUnauthorizedHandler(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); });
  useEffect(() => {
    let active = true;
    if (!token) { setUser(null); setLoading(false); return () => { active = false; }; }
    setLoading(true);
    apiMe().then(({ user: current }) => { if (active) setUser(current); }).catch(() => {
      if (active) { localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const authenticate = (result) => { localStorage.setItem(TOKEN_KEY, result.token); setUser(result.user); setToken(result.token); };
  const value = useMemo(() => ({ user, loading, login: async (values) => authenticate(await apiLogin(values)), register: async (values) => authenticate(await apiRegister(values)), logout: () => { localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); } }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
