/**
 * Type declarations for lucide-react v1.16.0
 *
 * The installed package has a broken `typings` field that points to a
 * non-existent file. This shim provides proper types until the upstream
 * package is fixed or replaced.
 */
declare module 'lucide-react' {
  import * as React from 'react';

  interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  type LucideIcon = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
  >;

  // ── Icons used in this project ───────────────────────────────────────────
  export const Archive: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const Building2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const Moon: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Settings: LucideIcon;
  export const Sun: LucideIcon;
  export const Wifi: LucideIcon;
  export const X: LucideIcon;
  export const Zap: LucideIcon;

  // Re-export the shared type so callers can annotate icon props
  export type { LucideIcon, LucideProps };
}
