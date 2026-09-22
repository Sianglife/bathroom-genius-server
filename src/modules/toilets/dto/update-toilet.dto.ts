import { PartialType } from '@nestjs/swagger';
import { CreateToiletDto } from './create-toilet.dto';

export class UpdateToiletDto extends PartialType(CreateToiletDto) {}
