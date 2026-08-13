import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const expected = process.env.DEVICE_API_KEY;
    if (!expected) {
      throw new UnauthorizedException(
        'DEVICE_API_KEY is not configured on the server',
      );
    }

    const header =
      req.headers['x-device-key'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!header || header !== expected) {
      throw new UnauthorizedException('Invalid device key');
    }
    return true;
  }
}
