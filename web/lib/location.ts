'use client';

// 攞用戶位置。
//
// 私隱:座標會經 RPC 傳去 Supabase 計附近餐廳,所以送出之前捨入到
// 小數點後 3 位(約 110m)。搵附近茶餐廳唔需要知你喺邊座大廈。

export type LatLng = { lat: number; lng: number };

export const roundCoord = (p: LatLng): LatLng => ({
  lat: Math.round(p.lat * 1000) / 1000,
  lng: Math.round(p.lng * 1000) / 1000,
});

export class LocateError extends Error {
  constructor(public kind: 'denied' | 'unavailable' | 'timeout' | 'unsupported', message: string) {
    super(message);
  }
}

export function locate(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocateError('unsupported', '呢個瀏覽器攞唔到位置'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(roundCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude })),
      (e) => reject(
        e.code === e.PERMISSION_DENIED
          ? new LocateError('denied', '你冇俾位置權限。可以喺瀏覽器網址列旁邊重新開返，或者揀個地區。')
          : e.code === e.TIMEOUT
            ? new LocateError('timeout', '搵位置搵得太耐，再試一次或者揀個地區。')
            : new LocateError('unavailable', '搵唔到你嘅位置，揀個地區先。'),
      ),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/** 之前已經俾過權限就唔使再問 —— 唔會彈窗 */
export async function alreadyGranted(): Promise<boolean> {
  try {
    const s = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return s?.state === 'granted';
  } catch {
    return false;
  }
}
