// 사양서 5.3 DTO. esbuild 번들은 데코레이터 타입 정보를 만들지 않으므로 컨트롤러에서 validateBody로 직접 검증한다.
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Length, Max, Min, MinLength, validate,
} from 'class-validator';

export class SignupDto {
  @IsEmail({}, { message: '이메일 형식을 확인하세요' }) email: string;
  @IsString() @MinLength(8, { message: '비밀번호는 8자 이상' }) password: string;
  @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @IsOptional() @IsString() timezone?: string;
}

export class LoginDto {
  @IsEmail({}, { message: '이메일 형식을 확인하세요' }) email: string;
  @IsString() @MinLength(1) password: string;
}

export class CreateInvestmentPlanDto {
  @IsOptional() @IsUUID() brokerConnectionId?: string;
  @IsOptional() @IsUUID() etfId?: string;
  @IsOptional() @IsString() ticker?: string;
  @IsNumberString({}, { message: '금액은 숫자 문자열로 보내세요' }) monthlyAmount: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsIn(['MONTHLY']) frequency?: string;
  @IsInt() @Min(1) @Max(31) scheduledDay: number;
  @IsOptional() @IsIn(['WHOLE_SHARE']) orderUnit?: string;
  @IsOptional() @IsIn(['LIMIT']) orderType?: string;
  @IsOptional() @IsBoolean() cashRollover?: boolean;
  @IsOptional() @IsString() timezone?: string;
}

export class UpdateInvestmentPlanDto {
  @IsNumberString() monthlyAmount: string;
  @IsInt() @Min(1) @Max(31) scheduledDay: number;
}

export class UpdateMeDto {
  @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() mfaEnabled?: boolean;
  @IsOptional() @IsBoolean() autoInvestEnabled?: boolean;
}

export class ScenarioDto {
  @IsIn(['NORMAL', 'PARTIAL_FILL', 'REJECT', 'LOW_FUNDS']) scenario: 'NORMAL' | 'PARTIAL_FILL' | 'REJECT' | 'LOW_FUNDS';
}

export async function validateBody<T extends object>(cls: new () => T, body: unknown): Promise<T> {
  const obj = plainToInstance(cls, body ?? {});
  const errors = await validate(obj as object, { whitelist: true, forbidNonWhitelisted: false });
  if (errors.length) {
    const msg = errors.flatMap((e) => Object.values(e.constraints ?? {}))[0] ?? '입력값을 확인하세요';
    throw new BadRequestException(msg);
  }
  return obj;
}
