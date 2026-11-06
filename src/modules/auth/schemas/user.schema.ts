import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class RoleChange {
  @Prop({ required: true }) from: string;
  @Prop({ required: true }) to: string;
  @Prop({ required: true }) operator: string;
  @Prop({ required: true }) at: Date;
}

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true }) providerId: string;
  @Prop({ required: true }) lineSubject: string;
  @Prop({ required: true }) displayName: string;
  @Prop({ enum: ['user', 'admin'], default: 'user', required: true })
  role: 'user' | 'admin';
  @Prop({ type: [SchemaFactory.createForClass(RoleChange)], default: [] })
  roleChanges: RoleChange[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ providerId: 1, lineSubject: 1 }, { unique: true });
