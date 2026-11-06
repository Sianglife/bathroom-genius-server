import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class AdminRoleService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async target(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id) || !Types.ObjectId.isValid(id))
      throw new Error('Invalid application user ID');
    const user = await this.users.findById(id).exec();
    if (!user) throw new NotFoundException('User does not exist');
    return user;
  }

  async change(
    id: string,
    role: 'user' | 'admin',
    expectedRole: 'user' | 'admin',
    operator: string,
  ) {
    if (role !== 'user' && role !== 'admin') throw new Error('Invalid role');
    const target = await this.target(id);
    if (target.role === role) return { changed: false };
    if (target.role !== expectedRole)
      throw new ConflictException(
        'Role changed; inspect the account and retry',
      );
    // Audit entry and role change are atomic in the same MongoDB document.
    const updated = await this.users
      .findOneAndUpdate(
        { _id: target._id, role: expectedRole },
        {
          $set: { role },
          $push: {
            roleChanges: {
              from: expectedRole,
              to: role,
              operator,
              at: new Date(),
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated)
      throw new ConflictException(
        'Role changed; inspect the account and retry',
      );
    return { changed: true };
  }
}
