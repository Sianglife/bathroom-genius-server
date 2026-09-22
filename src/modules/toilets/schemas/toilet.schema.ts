import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ToiletDocument = Toilet & Document;

/**
 * Open Info Schema
 */
@Schema({ _id: false })
export class OpenInfo {
  @Prop({ type: String, required: false })
  openType?: string;

  @Prop({ type: String, required: false })
  hours?: string;
}

/**
 * GeoJSON Point Location Schema
 */
@Schema({ _id: false })
export class GeoLocation {
  @Prop({ type: String, enum: ['Point'], default: 'Point', required: true })
  type: string;

  /**
   * GeoJSON 座標點順序規範：[lng, lat]
   * - coordinates[0]: 經度 Longitude (範圍: -180 到 180)
   * - coordinates[1]: 緯度 Latitude (範圍: -90 到 90)
   * 注意：MongoDB 2dsphere 空間索引嚴格要求 coordinates 順序為 [經度, 緯度] (Longitude, Latitude)
   */
  @Prop({ type: [Number], required: true })
  coordinates: number[];
}

@Schema({ timestamps: true, versionKey: false })
export class Toilet {
  @Prop({ type: String, required: true })
  name: string;

  /**
   * 地理位置 GeoJSON Point (包含 2dsphere 索引)
   * 座標順序為 [lng, lat] (經度, 緯度)
   */
  @Prop({ type: GeoLocation, required: true })
  location: GeoLocation;

  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: String, required: false })
  landmark?: string;

  @Prop({ type: String, required: false })
  googleMapUrl?: string;

  @Prop({ type: OpenInfo, required: false })
  openInfo?: OpenInfo;

  /**
   * 是否提供衛生紙 (三態支援)
   * - true: 提供 / 有
   * - false: 不提供 / 無
   * - null: 未知 / 未提供資訊 (預設值)
   */
  @Prop({ type: Boolean, default: null, required: false })
  hasToiletPaper?: boolean | null;

  /**
   * 是否有無障礙設施 (三態支援)
   * - true: 有設施
   * - false: 無設施
   * - null: 未知 / 未提供資訊 (預設值)
   */
  @Prop({ type: Boolean, default: null, required: false })
  isAccessible?: boolean | null;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, required: false })
  note?: string;

  @Prop({ type: Number, default: 0 })
  avgCleanScore: number;

  @Prop({ type: Number, default: 0 })
  avgConvenienceScore: number;

  @Prop({ type: Number, default: 0 })
  reviewCount: number;

  @Prop({ type: String, required: false })
  createdBy?: string;
}

export const ToiletSchema = SchemaFactory.createForClass(Toilet);

// 設定 2dsphere 空間索引以支援地理位置查詢 ($geoNear / $near)
ToiletSchema.index({ location: '2dsphere' });
