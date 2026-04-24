import { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

function StrokeIcon({ size = 18, className, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  )
}

export function SabicIcon({ size = 150, className }: { size?: number; className?: string }) {
  return (
    <img src="/sabic-logo.svg" alt="SABIC" className={className} style={{ width: size, height: 'auto' }} />
  )
}

export function DashboardIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.2" />
      <rect x="13" y="3" width="8" height="5" rx="1.2" />
      <rect x="13" y="10" width="8" height="11" rx="1.2" />
      <rect x="3" y="13" width="8" height="8" rx="1.2" />
    </StrokeIcon>
  )
}

export function ClaimsIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M16 4v4h4" />
      <path d="M9.5 12h5" />
      <path d="M9.5 16h7" />
    </StrokeIcon>
  )
}

export function EmployeeIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </StrokeIcon>
  )
}

export function AdminIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 3l7 3v5c0 5-2.8 8.8-7 10-4.2-1.2-7-5-7-10V6l7-3z" />
      <path d="M9.3 12.1l2 2 3.4-3.6" />
    </StrokeIcon>
  )
}

export function RiskIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 2l9 16H3L12 2z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </StrokeIcon>
  )
}

export function WrongClaimIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2l5.6 5.6" />
      <path d="M14.8 9.2l-5.6 5.6" />
    </StrokeIcon>
  )
}

export function AnalyzeIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.2-4.2" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </StrokeIcon>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 15V5" />
      <path d="M8.7 8.3L12 5l3.3 3.3" />
      <rect x="4" y="15" width="16" height="5" rx="2" />
    </StrokeIcon>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </StrokeIcon>
  )
}

export function PolicyIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M16 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </StrokeIcon>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M4 20a5 5 0 0 1 10 0" />
      <path d="M14.5 20a3.5 3.5 0 0 1 5.5 0" />
    </StrokeIcon>
  )
}

export function DocumentIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M16 4v4h4" />
    </StrokeIcon>
  )
}
