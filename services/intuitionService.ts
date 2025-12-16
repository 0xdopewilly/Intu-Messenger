import { User } from '../types';

// MAINNET ENDPOINT
const INTUITION_GRAPHQL_URL = 'https://mainnet.intuition.sh/v1/graphql'; 
const isLocal = window.location.hostname === 'localhost';
const BASE_URL = isLocal ? 'http://localhost:3001' : '';

// --- GRAPHQL QUERIES ---

const GET_IDENTITY_BY_ADDRESS = `
  query GetIdentityByAddress($address: String!) {
    atoms(where: { wallet_id: { _ilike: $address } }, limit: 1) {
      id
      label
      image
      data
      wallet_id
      term {
        vaults(limit: 1, order_by: { total_shares: desc }) {
          total_shares
          current_share_price
          positions_aggregate {
            aggregate {
              count
            }
          }
        }
      }
    }
  }
`;

const SEARCH_IDENTITIES = `
  query SearchIdentities($pattern: String!) {
    atoms(
      limit: 10, 
      order_by: { term: { vaults: { total_shares: desc } } },
      where: { 
        _or: [
            { label: { _ilike: $pattern } },
            { wallet_id: { _ilike: $pattern } }
        ]
      }
    ) {
      id
      label
      image
      wallet_id
      type
      term {
        vaults(limit: 1) {
          total_shares
        }
      }
    }
  }
`;

const GET_POPULAR_IDENTITIES = `
  query GetDiscoveryAtoms {
    atoms(
      limit: 20, 
      order_by: { term: { vaults: { total_shares: desc } } },
      where: { 
        type: { _eq: "person" },
        image: { _is_null: false }
      }
    ) {
      id
      label
      image
      wallet_id
      term {
        vaults(limit: 1) {
          total_shares
        }
      }
    }
  }
`;

const GET_POPULAR_COMMUNITIES = `
  query GetDiscoveryCommunities {
    atoms(
      limit: 20, 
      order_by: { term: { vaults: { total_shares: desc } } },
      where: { 
        type: { _neq: "person" },
        image: { _is_null: false }
      }
    ) {
      id
      label
      image
      wallet_id
      term {
        vaults(limit: 1) {
          total_shares
        }
      }
    }
  }
`;

const GET_USER_POSITIONS = `
  query GetUserPositions($address: String!) {
    positions(where: { account: { id: { _ilike: $address } } }, limit: 10) {
      shares
      vault {
        atom {
          label
          type
        }
      }
    }
  }
`;

const GET_USER_CLAIMS = `
  query GetUserClaims($address: String!) {
    triples(
      where: { 
        subject: { wallet_id: { _ilike: $address } }
      },
      limit: 5,
      order_by: { id: desc }
    ) {
      predicate {
        label
      }
      object {
        label
      }
    }
  }
`;

// --- HELPER FUNCTIONS ---

const fetchGraphQL = async (query: string, variables: any = {}) => {
  try {
    const res = await fetch(INTUITION_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json();
    if (json.errors) {
      console.warn('[Intuition Mainnet] GraphQL Error:', json.errors);
      return null;
    }
    return json.data;
  } catch (e) {
    console.error('[Intuition Mainnet] Network Error:', e);
    return null;
  }
};

const calculateTrustScore = (vault: any): number => {
  if (!vault) return 10; 
  const shares = BigInt(vault.total_shares || 0);
  // Mainnet Calibration: 1 share is valuable.
  const score = Number(shares); 
  return Math.min(score + 10, 99);
};

// In-memory cache for trust updates/local settings overrides
const trustOverrides: Record<string, number> = {};

// Default settings if user hasn't configured them
const DEFAULT_SETTINGS = {
    minTrustScoreToDm: 20,
    requiresCollateral: true,
    collateralAmount: 50,
    allowList: [],
    blockList: []
};

export const intuitionService = {
  
  // 1. Get User Profile
  getUser: async (walletAddress: string): Promise<User | null> => {
    if (!walletAddress || walletAddress === 'me') return null;
    
    // Check local storage for settings override (Simulation of storing prefs off-chain)
    let localSettings = DEFAULT_SETTINGS;
    try {
        const stored = localStorage.getItem(`intu_settings_${walletAddress}`);
        if (stored) localSettings = JSON.parse(stored);
    } catch {}

    const intuData = await fetchGraphQL(GET_IDENTITY_BY_ADDRESS, { address: walletAddress });
    const atom = intuData?.atoms?.[0];

    let user: User = {
      id: walletAddress,
      walletAddress: walletAddress,
      name: `Anon ${walletAddress.slice(0,6)}`,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddress}`,
      bio: 'New to Intuition',
      trustScore: 10,
      reputationAtoms: [],
      communities: [],
      settings: localSettings
    };

    if (atom) {
      user.name = atom.label || user.name;
      user.avatar = atom.image || user.avatar;
      const vault = atom.term?.vaults?.[0];
      user.trustScore = calculateTrustScore(vault);

      const posData = await fetchGraphQL(GET_USER_POSITIONS, { address: walletAddress });
      if (posData?.positions) {
        user.communities = posData.positions
          .map((p: any) => p.vault?.atom?.label)
          .filter((l: string) => l);
      }

      const claimsData = await fetchGraphQL(GET_USER_CLAIMS, { address: walletAddress });
      if (claimsData?.triples) {
         user.reputationAtoms = claimsData.triples.map((t: any) => {
             const pred = t.predicate?.label || '';
             const obj = t.object?.label || '';
             if (pred.toLowerCase() === 'is a' || pred.toLowerCase() === 'is' || pred.toLowerCase() === 'type') return obj;
             return `${pred} ${obj}`;
         }).filter((s: string) => s);
      }
    }

    if (trustOverrides[walletAddress]) {
        user.trustScore = Math.max(user.trustScore, trustOverrides[walletAddress]);
    }

    return user;
  },

  // 2. Discovery
  searchUsers: async (query: string): Promise<User[]> => {
      // Allow searching by exact ENS name or partial match by wrapping in wildcards
      // The _ilike operator in GraphQL allows case-insensitive matching
      const data = await fetchGraphQL(SEARCH_IDENTITIES, { pattern: `%${query}%` });
      if (!data?.atoms) return [];

      return data.atoms.map((atom: any) => ({
        id: atom.wallet_id || atom.id,
        walletAddress: atom.wallet_id || '0x000...',
        name: atom.label || 'Unknown',
        avatar: atom.image || `https://api.dicebear.com/7.x/identicon/svg?seed=${atom.id}`,
        bio: atom.type === 'person' ? 'Identity' : 'Community',
        trustScore: calculateTrustScore(atom.term?.vaults?.[0]),
        reputationAtoms: [atom.type === 'person' ? 'Person' : 'Community'],
        communities: []
      }));
  },

  getDiscoveryUsers: async (): Promise<User[]> => {
    const data = await fetchGraphQL(GET_POPULAR_IDENTITIES);
    if (!data?.atoms) return [];

    return data.atoms.map((atom: any) => ({
      id: atom.wallet_id || atom.id,
      walletAddress: atom.wallet_id || '0x000...',
      name: atom.label || 'Unknown',
      avatar: atom.image || `https://api.dicebear.com/7.x/identicon/svg?seed=${atom.id}`,
      bio: 'Discovered via Trust Graph',
      trustScore: calculateTrustScore(atom.term?.vaults?.[0]),
      reputationAtoms: ['Verified Identity'],
      communities: []
    })).filter((u: User) => u.walletAddress !== '0x000...');
  },

  getCommunities: async (): Promise<User[]> => {
    const data = await fetchGraphQL(GET_POPULAR_COMMUNITIES);
    if (!data?.atoms) return [];
    
    return data.atoms.map((atom: any) => ({
      id: atom.id, // Using Atom ID for communities
      walletAddress: atom.wallet_id || `group-${atom.id}`,
      name: atom.label || 'Unnamed Community',
      avatar: atom.image || `https://api.dicebear.com/7.x/shapes/svg?seed=${atom.id}`,
      bio: 'Intuition Community',
      trustScore: calculateTrustScore(atom.term?.vaults?.[0]),
      reputationAtoms: ['Community'],
      communities: []
    }));
  },

  getAllUsers: async (): Promise<User[]> => {
    return await intuitionService.getDiscoveryUsers();
  },

  // 3. Trust Gating Logic
  checkGate: async (senderAddress: string, receiverAddress: string): Promise<{ 
      allowed: boolean; 
      requiresCollateral: boolean; 
      collateralAmount: number;
      reason: string;
  }> => {
      // If receiver is a Group/Community (doesn't start with 0x usually, or is flagged)
      // For now, we assume simple ID checks or if it was fetched via getCommunities
      // Simplified: If receiving ID is NOT 'me' and we don't have settings, it might be a group.
      
      const receiver = await intuitionService.getUser(receiverAddress);
      const sender = await intuitionService.getUser(senderAddress);
      
      if (!receiver || !sender) return { allowed: false, requiresCollateral: false, collateralAmount: 0, reason: 'User not found' };

      const settings = receiver.settings || DEFAULT_SETTINGS;

      // 1. Blocklist Check
      if (settings.blockList.includes(senderAddress)) {
          return { allowed: false, requiresCollateral: false, collateralAmount: 0, reason: 'Blocked' };
      }

      // 2. Allowlist Check
      if (settings.allowList.includes(senderAddress)) {
          return { allowed: true, requiresCollateral: false, collateralAmount: 0, reason: 'Allowlisted' };
      }

      // 3. Trust Score Check
      if (sender.trustScore >= settings.minTrustScoreToDm) {
          return { allowed: true, requiresCollateral: false, collateralAmount: 0, reason: 'High Trust Score' };
      }

      // 4. Fallback: Request with Collateral
      return { 
          allowed: false, 
          requiresCollateral: settings.requiresCollateral, 
          collateralAmount: settings.collateralAmount,
          reason: `Trust Score ${sender.trustScore} < ${settings.minTrustScoreToDm}`
      };
  },

  // 4. Attest/Vouch
  attestToUser: async (targetUserId: string): Promise<boolean> => {
    console.log(`[Intuition Mainnet] Attesting to ${targetUserId}...`);
    await new Promise(r => setTimeout(r, 1500)); 
    
    const current = trustOverrides[targetUserId] || 10;
    const newScore = Math.min(current + 15, 99);
    trustOverrides[targetUserId] = newScore;
    
    return true;
  }
};