import { Controller, Post, Body, UseGuards, Get, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    const result = await this.authService.signup(signupDto);
    return { data: result };
  }

  @Post('login')
  @UseGuards(AuthGuard('local'))
  async login(@Body() _loginDto: LoginDto) {
    return { data: 'Use POST /api/auth/login with email & password' };
  }

  @Post('login-email')
  async loginWithEmail(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto.email, loginDto.password);
    return { data: result };
  }

  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const payload = this.authService.verifyRefreshToken(refreshTokenDto.refreshToken);
    const tokens = this.authService.generateTokens({ ...payload });
    return { data: tokens };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Body() req: any) {
    return { data: req.user };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout() {
    return { message: 'Logged out successfully' };
  }
}
