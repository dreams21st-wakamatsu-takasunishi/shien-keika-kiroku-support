import type { UserProfile } from '../types';
// Compare every profile field, including role, recorder binding and device
// policy. A refreshed JWT alone must not restart all workspace queries/channels.
export function sameUserProfile(left: UserProfile | null, right: UserProfile) {
  return left !== null && (Object.keys(right) as (keyof UserProfile)[]).every(key => left[key] === right[key])
    && (Object.keys(left) as (keyof UserProfile)[]).every(key => left[key] === right[key]);
}
