import { ImageResponse } from 'next/og';

// Home-screen icon for iPhone / «Add to home screen» — same mark as app/icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111113', color: '#fff', fontSize: 80, fontWeight: 700 }}>
        mg
      </div>
    ),
    size,
  );
}
