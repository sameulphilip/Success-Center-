import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post('phone/status')
  phoneStatus(@Body() body: { phone: string }) {
    return this.auth.phoneStatus(body.phone);
  }

  @Post('phone/setup')
  phoneSetup(@Body() body: { phone: string; password: string }) {
    return this.auth.phoneSetup(body.phone, body.password);
  }

  @Post('phone/login')
  phoneLogin(@Body() body: { phone: string; password: string }) {
    return this.auth.phoneLogin(body.phone, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.me(user.userId);
  }
}
