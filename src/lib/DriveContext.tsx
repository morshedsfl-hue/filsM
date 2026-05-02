import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface DriveContextType {
  accessToken: string | null;
  driveUser: { email: string; name: string; picture: string } | null;
  requestToken: (options?: { prompt?: string }) => Promise<string>;
  setAccessToken: (token: string | null) => void;
  logoutDrive: () => void;
  error: string | null;
}

const DriveContext = createContext<DriveContextType | null>(null);

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '306993001664-kgtfjo6v8t22qnctg5stmilbe1bldi5n.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

export function DriveProvider({ children }: { children: React.ReactNode, key?: React.Key }) {
  const { user } = useAuth();
  const [accessToken, setAccessTokenState] = useState<string | null>(localStorage.getItem('drive_access_token'));
  const [driveUser, setDriveUser] = useState<{ email: string; name: string; picture: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setAccessToken = (token: string | null) => {
    setAccessTokenState(token);
    if (token) {
      localStorage.setItem('drive_access_token', token);
    } else {
      localStorage.removeItem('drive_access_token');
      setDriveUser(null);
    }
  };

  useEffect(() => {
    const fetchUserInfo = async (token: string) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.status === 401) {
          logoutDrive();
          return;
        }
        
        if (!res.ok) throw new Error('Failed to fetch user info');
        const data = await res.json();
        
        // Strict check: Connected Drive email must match Logged-in App email
        if (data && data.email) {
          if (user && user.email && data.email.toLowerCase() !== user.email.toLowerCase()) {
            setError(`Security Restriction: You must connect the Google Drive account associated with ${user.email}.`);
            logoutDrive();
            return;
          }
          
          setError(null);
          setDriveUser({ email: data.email, name: data.name, picture: data.picture });
          localStorage.setItem('last_drive_email', data.email);
        }
      } catch (err: any) {
        console.error('Drive user info error:', err);
      }
    };

    if (accessToken) {
      fetchUserInfo(accessToken);
    } else {
      setDriveUser(null);
    }
  }, [accessToken, user]);

  const requestToken = (options?: { prompt?: string }): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!CLIENT_ID) {
        reject(new Error('Google Client ID is missing. Please add VITE_GOOGLE_CLIENT_ID in the app settings.'));
        return;
      }
      try {
        setError(null);
        // @ts-ignore
        const client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          prompt: options?.prompt || '',
          hint: user?.email || '',
          callback: (response: any) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
              resolve(response.access_token);
            } else {
              reject(new Error('Failed to get access token'));
            }
          },
        });
        client.requestAccessToken();
      } catch (error) {
        reject(error);
      }
    });
  };

  const logoutDrive = () => {
    setAccessToken(null);
  };

  return (
    <DriveContext.Provider value={{ accessToken, driveUser, requestToken, setAccessToken, logoutDrive, error }}>
      {children}
    </DriveContext.Provider>
  );
}

export const useDrive = () => {
  const context = useContext(DriveContext);
  if (!context) throw new Error('useDrive must be used within DriveProvider');
  return context;
}
