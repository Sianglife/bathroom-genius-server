import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<
  string,
  Types.ObjectId
> {
  transform(value: string): Types.ObjectId {
    const valid = Types.ObjectId.isValid(value);
    if (!valid) {
      throw new BadRequestException(`Invalid ObjectId: '${value}'`);
    }
    return new Types.ObjectId(value);
  }
}
