import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ToiletsController } from './toilets.controller';
import { ToiletsService } from './toilets.service';
import { Toilet, ToiletSchema } from './schemas/toilet.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Toilet.name, schema: ToiletSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  ],
  controllers: [ToiletsController],
  providers: [ToiletsService],
  exports: [ToiletsService, MongooseModule],
})
export class ToiletsModule {}
