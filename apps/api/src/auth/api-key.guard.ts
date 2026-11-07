import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Keep health checks publicly accessible.
    if (request.path === '/health') {
      return true;
    }

    const expectedKey = process.env.API_ACCESS_KEY;
    const authorization = request.headers.authorization;

    if (!expectedKey || !authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    const providedKey = authorization.slice(7);

    const expected = Buffer.from(expectedKey);
    const provided = Buffer.from(providedKey);

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
