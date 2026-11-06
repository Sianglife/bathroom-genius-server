import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LineCallbackDto,
  LineLoginDto,
  LineStartDto,
} from './dto/line-login.dto';
import { CsrfGuard, SessionAuthGuard } from './guards/session-auth.guard';
import type { AuthRequest } from './auth.utils';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '取得綁定 session 的 CSRF token；未登入時建立短效訪客 session',
  })
  csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.csrf(request, response);
  }

  @Get('line/start')
  @ApiOperation({ summary: '開始 LINE Login，returnTo 僅接受允許的站內路由' })
  async start(
    @Req() request: Request,
    @Res() response: Response,
    @Query() query: LineStartDto,
  ) {
    response.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    response.redirect(await this.auth.start(request, response, query.returnTo));
  }

  @Get('line/callback')
  @ApiOperation({ summary: '驗證 LINE 授權碼、state、nonce 與 PKCE，返回原頁' })
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query() query: LineCallbackDto,
  ) {
    response.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    response.redirect(
      await this.auth.callback(
        request,
        response,
        query.state,
        query.code,
        query.error,
      ),
    );
  }

  @Post('line')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary: '驗證 LIFF ID token，輪替 session 並回傳登入者與新 CSRF token',
  })
  login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: LineLoginDto,
  ) {
    return this.auth.liff(request, response, body.idToken);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth('session')
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(request, response);
  }
}
