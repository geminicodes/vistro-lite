export interface Site {
  id: string;
  name: string;
  domain: string;
  siteKey: string;
  createdAt: string;
  translationCount: number;
}

const SITES_KEY = 'vistro_sites';

function generateSiteKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'vlt_';
  for (let i = 0; i < 24; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export const mockData = {
  getSites: (): Site[] => {
    const stored = localStorage.getItem(SITES_KEY);
    if (!stored) return [];
    
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  createSite: (name: string, domain: string): Site => {
    const sites = mockData.getSites();
    const newSite: Site = {
      id: crypto.randomUUID(),
      name,
      domain,
      siteKey: generateSiteKey(),
      createdAt: new Date().toISOString(),
      translationCount: 0,
    };
    
    sites.push(newSite);
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));
    return newSite;
  },

  getSite: (id: string): Site | null => {
    const sites = mockData.getSites();
    return sites.find(s => s.id === id) || null;
  },

  updateSite: (id: string, updates: Partial<Site>): Site | null => {
    const sites = mockData.getSites();
    const index = sites.findIndex(s => s.id === id);
    
    if (index === -1) return null;
    
    sites[index] = { ...sites[index], ...updates };
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));
    return sites[index];
  },

  deleteSite: (id: string): boolean => {
    const sites = mockData.getSites();
    const filtered = sites.filter(s => s.id !== id);
    
    if (filtered.length === sites.length) return false;
    
    localStorage.setItem(SITES_KEY, JSON.stringify(filtered));
    return true;
  },
};
