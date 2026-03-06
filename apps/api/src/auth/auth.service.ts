import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(input: LoginInput): Promise<{
    accessToken: string;
    user: { id: string; email: string; name: string; role: string; teamIds: string[] };
  }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const teamMemberships = await this.prisma.teamMembership.findMany({
      where: { userId: user.id },
      select: { teamId: true }
    });

    const teamIds = teamMemberships.map((row) => row.teamId);
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      teamIds
    };

    const accessToken = sign(payload, process.env.JWT_SECRET ?? 'local-dev-secret', {
      expiresIn: '12h'
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamIds
      }
    };
  }
}
