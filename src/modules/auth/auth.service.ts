import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Request, Response } from 'express';
import { AuthConfig } from './auth.config';
import { LineIdentityService } from './line-identity.service';
import { User, UserDocument } from './schemas/user.schema';
import { LoginAttempt, Session } from './schemas/session.schema';
import {
  equalToken,
  hashToken,
  Principal,
  randomToken,
  safeReturnTo,
  sessionToken,
} from './auth.utils';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(LoginAttempt.name)
    private readonly attempts: Model<LoginAttempt>,
    private readonly config: AuthConfig,
    private readonly line: LineIdentityService,
  ) {}

  async findSession(request: Request) {
    const token = sessionToken(request, this.config.cookieName);
    if (!token) return null;
    // TTL indexes clean up asynchronously; expiry must also be checked here.
    return this.sessions
      .findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
      .exec();
  }

  private async createSession(response: Response, userId?: Types.ObjectId) {
    const token = randomToken();
    const ttl = userId ? this.config.sessionTtlMs : 15 * 60 * 1000;
    const session = await this.sessions.create({
      tokenHash: hashToken(token),
      csrfToken: randomToken(),
      userId,
      expiresAt: new Date(Date.now() + ttl),
    });
    response.cookie(
      this.config.cookieName,
      token,
      this.config.cookieOptions(ttl),
    );
    return session;
  }

  async csrf(request: Request, response: Response) {
    const session =
      (await this.findSession(request)) || (await this.createSession(response));
    return { csrfToken: session.csrfToken };
  }

  async requireUser(request: Request): Promise<Principal> {
    const session = await this.findSession(request);
    if (!session?.userId) throw new UnauthorizedException('Login required');
    // Role is always read fresh, so revocation affects the next request.
    const user = await this.users.findById(session.userId).exec();
    if (!user) throw new UnauthorizedException('Login required');
    return { id: user.id, displayName: user.displayName, role: user.role };
  }

  async checkCsrf(request: Request) {
    if (request.headers.origin !== this.config.origin)
      throw new ForbiddenException('Invalid request origin');
    const session = await this.findSession(request);
    if (
      !session ||
      !equalToken(request.headers['x-csrf-token'], session.csrfToken)
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }
  }

  async start(request: Request, response: Response, returnTo: unknown) {
    this.config.requireLogin();
    const session =
      (await this.findSession(request)) || (await this.createSession(response));
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken();
    await this.attempts.create({
      stateHash: hashToken(state),
      sessionHash: session.tokenHash,
      nonce,
      verifier,
      returnTo: safeReturnTo(returnTo),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.channelId,
      redirect_uri: this.config.callbackUrl,
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: Buffer.from(hashToken(verifier), 'hex').toString(
        'base64url',
      ),
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async callback(
    request: Request,
    response: Response,
    state: string,
    code?: string,
    error?: string,
  ) {
    this.config.requireLogin();
    const session = await this.findSession(request);
    if (!session) throw new UnauthorizedException('Login attempt expired');
    // Atomic one-time consumption binds the callback to the initiating browser.
    const attempt = await this.attempts
      .findOneAndDelete({
        stateHash: hashToken(state),
        sessionHash: session.tokenHash,
        expiresAt: { $gt: new Date() },
      })
      .exec();
    if (!attempt) throw new UnauthorizedException('Invalid login attempt');
    if (error?.toUpperCase() === 'ACCESS_DENIED') {
      return `${safeReturnTo(attempt.returnTo)}?login=cancelled`;
    }
    if (error || !code)
      throw new UnauthorizedException('LINE authentication failed');
    const token = await this.line.exchange(code, attempt.verifier);
    const identity = await this.line.verify(
      token,
      this.config.channelId,
      attempt.nonce,
    );
    await this.signIn(request, response, identity);
    return safeReturnTo(attempt.returnTo);
  }

  async liff(request: Request, response: Response, idToken: string) {
    const identity = await this.line.verify(idToken, this.config.liffChannelId);
    return this.signIn(request, response, identity);
  }

  private async signIn(
    request: Request,
    response: Response,
    identity: { sub: string; name?: string },
  ) {
    const filter = {
      providerId: this.config.providerId,
      lineSubject: identity.sub,
    };
    const name =
      typeof identity.name === 'string' && identity.name.trim()
        ? identity.name.slice(0, 100)
        : 'LINE 使用者';
    let user: UserDocument | null;
    try {
      user = await this.users
        .findOneAndUpdate(
          filter,
          {
            $set: { displayName: name },
            $setOnInsert: { ...filter, role: 'user' },
          },
          { upsert: true, new: true, runValidators: true },
        )
        .exec();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      user = await this.users.findOne(filter).exec();
    }
    if (!user) throw new UnauthorizedException('Unable to sign in');
    const previous = await this.findSession(request);
    const session = await this.createSession(response, user._id);
    if (previous) await this.sessions.deleteOne({ _id: previous._id }).exec();
    return {
      user: { id: user.id, displayName: user.displayName, role: user.role },
      csrfToken: session.csrfToken,
    };
  }

  async logout(request: Request, response: Response) {
    const token = sessionToken(request, this.config.cookieName);
    if (token)
      await this.sessions.deleteOne({ tokenHash: hashToken(token) }).exec();
    response.clearCookie(this.config.cookieName, this.config.cookieOptions());
    return { success: true };
  }
}
