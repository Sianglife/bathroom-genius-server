import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ timestamps: true, versionKey: false })
export class Session {
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) userId?: Types.ObjectId;
  @Prop({ required: true }) csrfToken: string;
  @Prop({ required: true }) expiresAt: Date;
}
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type LoginAttemptDocument = HydratedDocument<LoginAttempt>;

@Schema({ versionKey: false })
export class LoginAttempt {
  @Prop({ required: true, unique: true }) stateHash: string;
  @Prop({ required: true }) sessionHash: string;
  @Prop({ required: true }) nonce: string;
  @Prop({ required: true }) verifier: string;
  @Prop({ required: true }) returnTo: string;
  @Prop({ required: true }) expiresAt: Date;
}
export const LoginAttemptSchema = SchemaFactory.createForClass(LoginAttempt);
LoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
