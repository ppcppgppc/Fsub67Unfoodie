import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db } from './db';

/** undefined = 載入中,null = 未登入 */
type UserId = string | null | undefined;

const UserContext = createContext<UserId>(undefined);

/** 成個 app 得一個 auth 訂閱,唔好每個畫面各自開一個 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<UserId>(undefined);

  useEffect(() => {
    db().auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = db().auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <UserContext.Provider value={userId}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);
