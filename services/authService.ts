import { User } from '../types';

// Determine API URL based on environment
const isLocal = window.location.hostname === 'localhost';
const BASE_URL = isLocal ? 'http://localhost:3001' : '';
const API_URL = `${BASE_URL}/api`;

export const authService = {
  // 1. Connect Wallet & Get Signer
  connectWallet: async (): Promise<string | null> => {
    if (!(window as any).ethereum) {
      alert("Please install MetaMask!");
      return null;
    }
    try {
      const provider = new (window as any).ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      return await signer.getAddress();
    } catch (e) {
      console.error("Wallet connection failed", e);
      return null;
    }
  },

  // 2. Login Flow: Try Backend -> Fail -> Use Offline Mode
  login: async (walletAddress: string): Promise<User | null> => {
    try {
      console.log(`[Auth] Attempting login for ${walletAddress}`);
      
      // OPTIMISTIC: Try to hit the API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for backend check

      try {
        const nonceRes = await fetch(`${API_URL}/auth/nonce?address=${walletAddress}`, { 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);

        // If backend is alive and returning JSON
        const contentType = nonceRes.headers.get("content-type");
        if (nonceRes.ok && contentType && contentType.includes("application/json")) {
           // --- REAL BACKEND FLOW ---
           const { nonce } = await nonceRes.json();
           const provider = new (window as any).ethers.BrowserProvider((window as any).ethereum);
           const signer = await provider.getSigner();
           const signature = await signer.signMessage(`Login to IntuMessenger. Nonce: ${nonce}`);

           const loginRes = await fetch(`${API_URL}/auth/verify`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ address: walletAddress, signature, message: `Login to IntuMessenger. Nonce: ${nonce}` })
           });

           if (loginRes.ok) {
             const { token, user } = await loginRes.json();
             localStorage.setItem('intu_jwt', token);
             localStorage.setItem('intu_user_id', user.id);
             return user;
           }
        }
      } catch (err) {
        // Fallthrough to offline mode
      }

      // --- OFFLINE / DEMO FALLBACK ---
      console.warn("[Auth] Backend unreachable. Enabling Offline Demo Mode.");
      
      // Simulate signing for realism
      const provider = new (window as any).ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      await signer.signMessage(`Login to IntuMessenger (Offline Mode)`);

      const mockUser: User = {
        id: walletAddress,
        walletAddress: walletAddress,
        name: 'Demo User',
        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddress}`,
        bio: 'Running in offline demo mode',
        trustScore: 85,
        reputationAtoms: ['Demo', 'Early Adopter'],
        communities: ['Ethereum', 'Intuition']
      };

      localStorage.setItem('intu_jwt', 'demo-token');
      localStorage.setItem('intu_user_id', walletAddress);
      
      return mockUser;

    } catch (e) {
      console.error("[Auth] Login Process Error:", e);
      return null;
    }
  },

  getCurrentUser: (): string | null => {
    return localStorage.getItem('intu_user_id');
  },

  logout: () => {
    localStorage.removeItem('intu_jwt');
    localStorage.removeItem('intu_user_id');
  }
};