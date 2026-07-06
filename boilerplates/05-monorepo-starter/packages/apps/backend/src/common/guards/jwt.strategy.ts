import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtStrategy {
  constructor(private jwtService: JwtService) {}

  validate(payload: any) {
    return { id: payload.id, email: payload.email, role: payload.role };
  }
}
