// 似 SF Symbols 嘅細 icon。inline SVG,跟 currentColor,唔使載字型。

type P = { size?: number; className?: string };

const svg = (d: React.ReactNode, vb = '0 0 24 24') =>
  function Icon({ size = 20, className }: P) {
    return (
      <svg width={size} height={size} viewBox={vb} className={className} aria-hidden="true"
           fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {d}
      </svg>
    );
  };

export const IconMap = svg(<><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z" /><path d="M9 4v13M15 6.5v13" /></>);
export const IconPeople = svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.2c2.3.1 3.7 1.6 4.1 4.3" /></>);
export const IconPerson = svg(<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>);
export const IconLogout = svg(<><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /><path d="M14 8l4 4-4 4M18 12H9" /></>);
export const IconChevron = svg(<path d="M9.5 6l6 6-6 6" />);
export const IconChevronLeft = svg(<path d="M14.5 6l-6 6 6 6" />);
export const IconCheck = svg(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconX = svg(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);
export const IconBang = svg(<><path d="M12 5v9" /><circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" /></>);
export const IconUturn = svg(<><path d="M8 7H14a5 5 0 0 1 0 10H8" /><path d="M10.5 4 7.5 7l3 3" /></>);
export const IconFork = svg(<><path d="M7 3v6a2 2 0 0 0 2 2v10M11 3v6a2 2 0 0 1-2 2M9 3v5" /><path d="M16 21V3c2 1 3 3.5 3 6.5S18 14 16 14" /></>);

/** 實心定位箭咀(Apple Maps 嗰個) */
export function IconLocate({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M20.6 3.4 3.9 10.3c-.8.3-.7 1.4.1 1.6l6.6 1.5 1.5 6.6c.2.8 1.3.9 1.6.1l6.9-16.7z" fill="currentColor" />
    </svg>
  );
}

/** 訊號 → icon:推薦 ✓、避 ✕、可疑 !、反而值得試 ↺、未知 刀叉 */
export const SIGNAL_ICON = {
  recommended: IconCheck,
  avoid: IconX,
  suspect: IconBang,
  contrarian: IconUturn,
  unknown: IconFork,
} as const;

/** 地圖 marker 用:同上,但係純 SVG 字串(marker 唔係 React) */
export const SIGNAL_SVG: Record<keyof typeof SIGNAL_ICON, string> = {
  recommended: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  avoid: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  suspect: '<path d="M12 5v9"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none"/>',
  contrarian: '<path d="M8 7H14a5 5 0 0 1 0 10H8"/><path d="M10.5 4 7.5 7l3 3"/>',
  unknown: '<path d="M7 3v6a2 2 0 0 0 2 2v10M11 3v6a2 2 0 0 1-2 2M9 3v5"/><path d="M16 21V3c2 1 3 3.5 3 6.5S18 14 16 14"/>',
};
