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
  export const BarChart3: LucideIcon;
  export const Users: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Bell: LucideIcon;
  export const Building2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Copy: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const FileText: LucideIcon;
  export const GitBranch: LucideIcon;
  export const Keyboard: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const Lock: LucideIcon;
  export const Moon: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const Sun: LucideIcon;
  export const Wifi: LucideIcon;
  export const X: LucideIcon;
  export const Zap: LucideIcon;
  export const Check: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const CircleCheck: LucideIcon;
  export const Clock: LucideIcon;
  export const CloudUpload: LucideIcon;
  export const Download: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Folder: LucideIcon;
  export const Inbox: LucideIcon;
  export const KeyRound: LucideIcon;
  export const Link: LucideIcon;
  export const LogOut: LucideIcon;
  export const Pencil: LucideIcon;
  export const QrCode: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Send: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const Smartphone: LucideIcon;
  export const Trash2: LucideIcon;
  export const TriangleAlert: LucideIcon;
  export const Upload: LucideIcon;
  export const User: LucideIcon;

  // Re-export the shared type so callers can annotate icon props
  export type { LucideIcon, LucideProps };
}
