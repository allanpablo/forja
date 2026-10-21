import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;

  @ApiProperty({ minLength: 12 })
  @IsString() @MinLength(12) @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'A senha precisa ter minúscula, maiúscula e número' })
  password: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) organizationName: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(128) password: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty() refreshToken: string;
}
