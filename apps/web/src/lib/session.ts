export type Role = 'ADMIN' | 'MANAGER' | 'REP';

export interface Session {
  token: string;
  role: Role;
  userId: string;
  email: string;
  name: string;
  teamIds: string[];
}

export function encodeSession(session: Session): string {
  return encodeURIComponent(JSON.stringify(session));
}

export function decodeSession(raw: string | undefined | null): Session | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(raw)) as Session;
  } catch {
    return null;
  }
}
