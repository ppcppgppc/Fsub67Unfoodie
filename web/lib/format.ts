// web 專屬:class 名。其餘(signed、safeHttpUrl、errMsg)喺 @unfoodie/core。
import { toneOf } from '@unfoodie/core';

export { signed, safeHttpUrl, errMsg } from '@unfoodie/core';

const CLASS = { good: 't-good', bad: 't-bad', neutral: 't-dim' } as const;

/** 正數綠、負數紅、零灰 */
export const toneClass = (n: number) => CLASS[toneOf(n)];
