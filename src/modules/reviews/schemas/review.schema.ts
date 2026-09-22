import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { Toilet } from '../../toilets/schemas/toilet.schema';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true, versionKey: false })
export class Review {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Toilet.name,
    required: true,
    index: true,
  })
  toiletId: Types.ObjectId;

  @Prop({ type: Number, required: false, min: 1, max: 5 })
  cleanScore?: number;

  @Prop({ type: Number, required: false, min: 1, max: 5 })
  convenienceScore?: number;

  @Prop({ type: Boolean, required: false, default: null })
  hasToiletPaper?: boolean | null;

  @Prop({ type: String, required: false })
  comment?: string;

  @Prop({ type: String, required: false, default: '路過公廁大師' })
  authorName?: string;

  @Prop({ type: String, required: false })
  userId?: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
