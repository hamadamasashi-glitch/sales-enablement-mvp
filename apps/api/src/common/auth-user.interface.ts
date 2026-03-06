import { Role } from './role.enum';

export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
  teamIds: string[];
}
