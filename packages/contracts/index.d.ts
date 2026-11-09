/** Planned web contract. Runtime validation remains the responsibility of DTOs. */
export type FacilityStatus = boolean | null;
export type UserRole = 'user' | 'admin';
export interface ApiError {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
}
export interface CurrentUser {
  id: string;
  displayName: string;
  role: UserRole;
}
export type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'authenticated'; user: CurrentUser };
export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
export interface NearbyPage<T> extends Page<T> {
  hasMore: boolean;
}
export interface ToiletSummary {
  _id: string;
  name: string;
  address: string;
  location: { type: 'Point'; coordinates: [number, number] };
  landmark?: string;
  googleMapUrl?: string;
  openInfo?: { openType?: string; hours?: string };
  hasToiletPaper: FacilityStatus;
  isAccessible: FacilityStatus;
  tags: string[];
  note?: string;
  avgCleanScore: number;
  avgConvenienceScore: number;
  reviewCount: number;
  distance?: number;
}
export type Score = 1 | 2 | 3 | 4 | 5;
export interface ReviewInput {
  cleanScore?: Score | null;
  convenienceScore?: Score | null;
  hasToiletPaper?: FacilityStatus;
  comment?: string | null;
  isAnonymous?: boolean;
}
export interface PublicReview {
  _id: string;
  toiletId: string;
  cleanScore?: Score | null;
  convenienceScore?: Score | null;
  hasToiletPaper: FacilityStatus;
  comment?: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  isAnonymous?: boolean;
  canEdit: boolean;
}
export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}
