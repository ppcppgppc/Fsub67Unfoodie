// UNFOODIE — DB 存取。web 同 app 共用,所以呢度唔可以有任何平台專屬嘅嘢。

import type { Db } from './client';
import type {
  ScoredRestaurant, TasteMatch, Foodie, MentionDetail, StanceTier, StanceReason,
} from './types';

/**
 * 附近餐廳 + 信任訊號。
 * p_user 由 client 傳,但 RLS 保證你只讀到自己嘅 stance ——
 * 傳第二個人嘅 uuid 只會令所有權重變 0,洩漏唔到嘢。
 */
export async function nearbyWithScore(
  db: Db,
  userId: string,
  lat: number,
  lng: number,
  radiusM = 1500,
): Promise<ScoredRestaurant[]> {
  const { data, error } = await db.rpc('nearby_with_score', {
    p_user: userId,
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
  });
  if (error) throw error;
  return (data ?? []) as ScoredRestaurant[];
}

export async function tasteMatchFoodies(
  db: Db,
  userId: string,
  minOverlap = 3,
): Promise<TasteMatch[]> {
  const { data, error } = await db.rpc('taste_match_foodies', {
    p_user: userId,
    p_min_overlap: minOverlap,
  });
  if (error) throw error;
  return (data ?? []) as TasteMatch[];
}

export async function listFoodies(db: Db, userId: string): Promise<Foodie[]> {
  const [{ data: foodies, error: e1 }, { data: stances, error: e2 }] = await Promise.all([
    db.from('foodie').select('id, display_name, primary_market, foodie_account(platform, handle, url, follower_count)'),
    db.from('user_foodie_stance').select('foodie_id, tier, reason').eq('user_id', userId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byId = new Map((stances ?? []).map((s: any) => [s.foodie_id, s]));
  return (foodies ?? []).map((f: any) => ({
    id: f.id,
    display_name: f.display_name,
    primary_market: f.primary_market,
    accounts: f.foodie_account ?? [],
    stance: byId.get(f.id) ?? null,
  }));
}

export async function setStance(
  db: Db,
  userId: string,
  foodieId: string,
  tier: StanceTier | null,
  reason: StanceReason = 'manual',
) {
  if (tier === null) {
    const { error } = await db.from('user_foodie_stance')
      .delete().eq('user_id', userId).eq('foodie_id', foodieId);
    if (error) throw error;
    return;
  }
  const { error } = await db.from('user_foodie_stance')
    .upsert({ user_id: userId, foodie_id: foodieId, tier, reason },
            { onConflict: 'user_id,foodie_id' });
  // 名額滿咗會撞 check_violation —— 錯誤訊息直接俾 UI 顯示
  if (error) throw error;
}

/** 邊個講過呢間舖,佢哋喺你名單入面係咩位置 */
export async function restaurantMentions(
  db: Db, userId: string, restaurantId: string,
): Promise<MentionDetail[]> {
  const { data, error } = await db
    .from('mention')
    .select(`
      id, sentiment_score, extract_confidence, match_confidence, is_disclosed_ad,
      post!inner ( url, posted_at,
        foodie_account!inner ( platform, handle,
          foodie!inner ( id, display_name ) ) )
    `)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active');
  if (error) throw error;

  const { data: stances } = await db
    .from('user_foodie_stance').select('foodie_id, tier').eq('user_id', userId);
  const tierOf = new Map((stances ?? []).map((s: any) => [s.foodie_id, s.tier]));

  return (data ?? []).map((m: any) => {
    const acc = m.post.foodie_account;
    return {
      id: m.id,
      sentiment_score: m.sentiment_score,
      extract_confidence: m.extract_confidence,
      match_confidence: m.match_confidence,
      is_disclosed_ad: m.is_disclosed_ad,
      posted_at: m.post.posted_at,
      post_url: m.post.url,
      foodie_id: acc.foodie.id,
      foodie_name: acc.foodie.display_name,
      platform: acc.platform,
      handle: acc.handle,
      tier: tierOf.get(acc.foodie.id) ?? null,
    } as MentionDetail;
  }).sort((a, b) => b.sentiment_score - a.sentiment_score);
}

export async function getRestaurant(db: Db, id: string) {
  const { data, error } = await db.from('restaurant')
    .select('id, name, name_local, address, country_code, cuisine').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function rateRestaurant(
  db: Db, userId: string, restaurantId: string, score: number,
) {
  const { error } = await db.from('user_rating').upsert(
    { user_id: userId, restaurant_id: restaurantId, score, visited_on: new Date().toISOString().slice(0, 10) },
    { onConflict: 'user_id,restaurant_id' });
  if (error) throw error;
}

export async function myRating(db: Db, userId: string, restaurantId: string) {
  const { data } = await db.from('user_rating')
    .select('score').eq('user_id', userId).eq('restaurant_id', restaurantId).maybeSingle();
  return data?.score ?? null;
}
