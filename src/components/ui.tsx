import { useState, type ReactNode, type ButtonHTMLAttributes } from "react"
import { api, ApiError } from "../api/client"
import { mediaSrc } from "../lib/view"

// ─── Button ────────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "soft"
type ButtonSize = "xs" | "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading,
  fullWidth,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer select-none"

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-[#2D6A4F] text-white hover:bg-[#1B4332] active:scale-[0.98] focus-visible:outline-[#2D6A4F] shadow-sm",
    secondary:
      "bg-[#E8694A] text-white hover:bg-[#C4512D] active:scale-[0.98] focus-visible:outline-[#E8694A] shadow-sm",
    ghost:
      "bg-transparent text-[#1B2A4A] hover:bg-[#F5F4EF] active:scale-[0.98] focus-visible:outline-[#2D6A4F]",
    danger:
      "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] focus-visible:outline-red-600 shadow-sm",
    outline:
      "border border-[#E8E6DF] bg-white text-[#1B2A4A] hover:bg-[#F5F4EF] active:scale-[0.98] focus-visible:outline-[#2D6A4F]",
    soft: "bg-[#D8F3DC] text-[#1B4332] hover:bg-[#B7E4C7] active:scale-[0.98] focus-visible:outline-[#2D6A4F]",
  }

  const sizes: Record<ButtonSize, string> = {
    xs: "text-xs px-3 py-1.5 h-7",
    sm: "text-sm px-4 py-2 h-9",
    md: "text-sm px-5 py-2.5 h-10",
    lg: "text-base px-7 py-3 h-12",
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        fullWidth ? "w-full" : ""
      } ${
        disabled || loading ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <SpinnerIcon size={size === "lg" ? 18 : 15} /> : icon}
      {children}
      {iconRight && !loading && iconRight}
    </button>
  )
}

function SpinnerIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="animate-spin"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

// ─── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = "green" | "coral" | "blue" | "navy" | "amber" | "gray" | "verified"

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  size?: "sm" | "md"
  icon?: ReactNode
  className?: string
}

export function Badge({
  variant = "gray",
  children,
  size = "md",
  icon,
  className = "",
}: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    green: "bg-[#D8F3DC] text-[#1B4332]",
    coral: "bg-[#FDE8E0] text-[#C4512D]",
    blue: "bg-[#DDEEFF] text-[#2B5F8E]",
    navy: "bg-[#EEF0F5] text-[#1B2A4A]",
    amber: "bg-[#FEF3C7] text-[#92400E]",
    gray: "bg-[#F5F4EF] text-[#5C6E8A]",
    verified: "bg-[#2D6A4F] text-white",
  }
  const sizes = {
    sm: "text-xs px-2 py-0.5 rounded-md",
    md: "text-xs px-2.5 py-1 rounded-lg",
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  src?: string
  name?: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  verified?: boolean
  className?: string
}

export function Avatar({
  src,
  name,
  size = "md",
  verified,
  className = "",
}: AvatarProps) {
  const sizes = {
    xs: "w-6 h-6 text-xs",
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-lg",
  }
  const badgeSizes = {
    xs: "w-2 h-2",
    sm: "w-2.5 h-2.5",
    md: "w-3 h-3",
    lg: "w-4 h-4",
    xl: "w-5 h-5",
  }
  const initials =
    name
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {src ? (
        <img
          src={`https://images.unsplash.com/${src}?w=80&h=80&fit=crop&auto=format`}
          alt={name}
          className={`${sizes[size]} rounded-full object-cover bg-[#EEF0F5]`}
        />
      ) : (
        <div
          className={`${sizes[size]} rounded-full bg-[#D8F3DC] text-[#2D6A4F] flex items-center justify-center font-semibold`}
        >
          {initials}
        </div>
      )}
      {verified && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${badgeSizes[size]} bg-[#2D6A4F] rounded-full flex items-center justify-center`}
        >
          <svg viewBox="0 0 10 10" fill="white" className="w-2/3 h-2/3">
            <path
              d="M2 5l2 2 4-4"
              stroke="white"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </div>
  )
}

// ─── StarRating ────────────────────────────────────────────────────────────────

export function StarRating({
  rating,
  count,
  size = "sm",
}: {
  rating: number
  count?: number
  size?: "xs" | "sm" | "md"
}) {
  const sizes = { xs: "text-xs", sm: "text-sm", md: "text-base" }
  const starSizes = { xs: 10, sm: 12, md: 14 }
  return (
    <div className={`flex items-center gap-1 ${sizes[size]}`}>
      <span className="text-[#F59E0B]">★</span>
      <span className="font-semibold text-[#1B2A4A]">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="text-[#8A9AB5]">({count})</span>}
    </div>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
  padding?: "none" | "sm" | "md" | "lg"
}

export function Card({
  children,
  className = "",
  hover,
  onClick,
  padding = "md",
}: CardProps) {
  const paddings = { none: "", sm: "p-4", md: "p-5", lg: "p-6" }
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-[#E8E6DF] shadow-[0_2px_8px_rgba(27,42,74,0.06)] ${
        hover ? "card-hover cursor-pointer" : ""
      } ${paddings[padding]} ${className}`}
    >
      {children}
    </div>
  )
}

// ─── Input ─────────────────────────────────────────────────────────────────────

interface InputProps {
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
  icon?: ReactNode
  iconRight?: ReactNode
  type?: string
  className?: string
  size?: "sm" | "md" | "lg"
  label?: string
}

export function Input({
  placeholder,
  value,
  onChange,
  icon,
  iconRight,
  type = "text",
  className = "",
  size = "md",
  label,
}: InputProps) {
  const sizes = {
    sm: "h-9 text-sm px-3",
    md: "h-11 text-sm px-4",
    lg: "h-13 text-base px-5",
  }
  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[#5C6E8A] mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9AB5] pointer-events-none">
          {icon}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full ${sizes[size]} ${icon ? "pl-10" : ""} ${
          iconRight ? "pr-10" : ""
        } bg-white border border-[#E8E6DF] rounded-xl text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10 transition-all`}
      />
      {iconRight && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A9AB5]">
          {iconRight}
        </span>
      )}
    </div>
  )
}

// ─── SearchBar ─────────────────────────────────────────────────────────────────

export function SearchBar({
  placeholder = "Search...",
  value,
  onChange,
  onSearch,
  size = "md",
  className = "",
}: {
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
  onSearch?: () => void
  size?: "md" | "lg"
  className?: string
}) {
  const heights = { md: "h-12", lg: "h-14" }
  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="absolute left-4 text-[#8A9AB5] pointer-events-none">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch?.()}
        className={`w-full ${heights[size]} pl-11 pr-28 bg-white border border-[#E8E6DF] rounded-full text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10 transition-all text-sm shadow-[0_2px_8px_rgba(27,42,74,0.06)]`}
      />
      <button
        onClick={onSearch}
        className="absolute right-2 bg-[#2D6A4F] text-white rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#1B4332] transition-colors"
      >
        Search
      </button>
    </div>
  )
}

// ─── Chip / Filter Tag ─────────────────────────────────────────────────────────

export function Chip({
  children,
  active,
  onClick,
  onRemove,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
        active
          ? "bg-[#2D6A4F] text-white border-[#2D6A4F]"
          : "bg-white text-[#1B2A4A] border-[#E8E6DF] hover:border-[#2D6A4F] hover:text-[#2D6A4F]"
      }`}
    >
      {children}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:opacity-70"
        >
          <svg
            viewBox="0 0 10 10"
            width="10"
            height="10"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          >
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </span>
      )}
    </button>
  )
}

// ─── ListingCard ───────────────────────────────────────────────────────────────

interface ListingCardProps {
  listing: {
    id: string
    title: string
    price: number | null
    isFree: boolean
    condition: string
    neighborhood: string
    distance: string
    postedAt: string
    images: string[]
    seller: {
      name: string
      avatar: string
      rating: number
      reviews: number
      verified: boolean
      idVerified?: boolean
    }
    saved: boolean
    views?: number
  }
  onClick?: () => void
  onSavedChange?: (saved: boolean) => void
  compact?: boolean
}

export function ListingCard({
  listing,
  onClick,
  onSavedChange,
  compact,
}: ListingCardProps) {
  const [saved, setSaved] = useState(listing.saved)
  const [imgErr, setImgErr] = useState(false)
  const [saveError, setSaveError] = useState("")

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-2xl border border-[#E8E6DF] overflow-hidden cursor-pointer card-hover"
    >
      {/* Image */}
      <div
        className={`relative bg-[#F5F4EF] overflow-hidden ${
          compact ? "h-36" : "h-48"
        }`}
      >
        {!imgErr && mediaSrc(listing.images[0], "w=500&h=400&fit=crop&auto=format") ? (
          <img
            src={mediaSrc(listing.images[0], "w=500&h=400&fit=crop&auto=format")!}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#C5CCDA]">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        {/* Save button */}
        <button
          onClick={async (e) => {
            e.stopPropagation()
            const nextSaved = !saved
            setSaved(nextSaved)
            setSaveError("")
            if (onSavedChange) {
              onSavedChange(nextSaved)
              return
            }
            try {
              const result = await api.listings.toggleFavorite(listing.id)
              setSaved(result.saved)
            } catch (cause: unknown) {
              setSaved(saved)
              setSaveError(
                cause instanceof ApiError
                  ? cause.message
                  : "Saving this listing is unavailable.",
              )
            }
          }}
          title={saveError || (saved ? "Remove from saved items" : "Save listing")}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill={saved ? "#E8694A" : "none"}
            stroke={saved ? "#E8694A" : "#5C6E8A"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        {saveError && (
          <span className="absolute top-11 right-2 max-w-40 rounded-lg bg-[#FFF5F2] px-2 py-1 text-[10px] leading-tight text-[#C4512D] shadow-sm">
            {saveError}
          </span>
        )}
        {/* Free badge */}
        {listing.isFree && (
          <div className="absolute top-2 left-2">
            <Badge variant="green">Free</Badge>
          </div>
        )}
        {/* Condition */}
        {listing.condition === "Like New" && !listing.isFree && (
          <div className="absolute top-2 left-2">
            <Badge variant="blue">Like New</Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p
            className={`font-semibold text-[#1B2A4A] leading-tight line-clamp-2 ${
              compact ? "text-sm" : "text-sm"
            }`}
          >
            {listing.title}
          </p>
          <span
            className={`flex-shrink-0 font-bold text-[#1B2A4A] ${
              compact ? "text-sm" : "text-base"
            }`}
          >
            {listing.isFree ? (
              <span className="text-[#2D6A4F]">Free</span>
            ) : listing.price ? (
              `$${listing.price.toLocaleString()}`
            ) : (
              "OBO"
            )}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-[#8A9AB5] mb-3">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {listing.neighborhood} · {listing.distance} · {listing.postedAt}
        </div>

        {!compact && (
          <div className="flex items-center justify-between pt-3 border-t border-[#F5F4EF]">
            <div className="flex items-center gap-2">
              <Avatar
                src={listing.seller.avatar}
                name={listing.seller.name}
                size="xs"
                verified={listing.seller.verified}
              />
              <div>
                <p className="text-xs font-medium text-[#1B2A4A]">
                  {listing.seller.name}
                </p>
                {listing.seller.rating > 0 && (
                  <StarRating
                    rating={listing.seller.rating}
                    count={listing.seller.reviews}
                    size="xs"
                  />
                )}
              </div>
            </div>
            {listing.seller.idVerified && (
              <Badge variant="green" size="sm">
                ID Verified
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab Bar ───────────────────────────────────────────────────────────────────

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div className="flex gap-1 bg-[#F5F4EF] p-1 rounded-xl">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            active === tab
              ? "bg-white text-[#1B2A4A] shadow-sm"
              : "text-[#8A9AB5] hover:text-[#1B2A4A]"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  action,
  actionLabel,
  className = "",
}: {
  title: string
  subtitle?: string
  action?: () => void
  actionLabel?: string
  className?: string
}) {
  return (
    <div className={`flex items-end justify-between mb-5 ${className}`}>
      <div>
        <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-[#8A9AB5] mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && actionLabel && (
        <button
          onClick={action}
          className="text-sm font-semibold text-[#2D6A4F] hover:text-[#1B4332] transition-colors"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  )
}

// ─── Select ────────────────────────────────────────────────────────────────────

export function Select({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  label?: string
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-[#5C6E8A] mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Toggle ────────────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      {label && <span className="text-sm text-[#1B2A4A]">{label}</span>}
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
          checked ? "bg-[#2D6A4F]" : "bg-[#E8E6DF]"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
    </label>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

export function Toast({
  message,
  type = "success",
  onDismiss,
}: {
  message: string
  type?: "success" | "error" | "info"
  onDismiss?: () => void
}) {
  const types = {
    success: "bg-[#1B4332] text-white",
    error: "bg-red-700 text-white",
    info: "bg-[#2B5F8E] text-white",
  }
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${types[type]}`}
    >
      {type === "success" && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {message}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-2 opacity-70 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  icon,
  color = "green",
}: {
  label: string
  value: string
  sub?: string
  icon?: ReactNode
  color?: "green" | "coral" | "blue" | "amber"
}) {
  const colors = {
    green: "bg-[#D8F3DC] text-[#2D6A4F]",
    coral: "bg-[#FDE8E0] text-[#E8694A]",
    blue: "bg-[#DDEEFF] text-[#4A7FB5]",
    amber: "bg-[#FEF3C7] text-[#D97706]",
  }
  return (
    <Card className="flex items-start gap-4">
      {icon && (
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}
        >
          {icon}
        </div>
      )}
      <div>
        <p className="text-2xl font-bold font-display text-[#1B2A4A]">
          {value}
        </p>
        <p className="text-xs font-semibold text-[#8A9AB5] uppercase tracking-wide">
          {label}
        </p>
        {sub && <p className="text-xs text-[#8A9AB5] mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
  actionLabel,
  icon,
}: {
  title: string
  description?: string
  action?: () => void
  actionLabel?: string
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-[#F5F4EF] flex items-center justify-center mb-4 text-[#C5CCDA]">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-[#1B2A4A] mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[#8A9AB5] max-w-xs">{description}</p>
      )}
      {action && actionLabel && (
        <Button variant="primary" size="sm" className="mt-5" onClick={action}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

/** Same loading and error shells Saved Items, Dashboard, and Messages already use. */
export function LoadState({
  loading,
  error,
  loadingLabel,
}: {
  loading?: boolean
  error?: string
  loadingLabel: string
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
        {loadingLabel}
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]">
        {error}
      </div>
    )
  }
  return null
}

export function InlineAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      className="rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]"
      role="alert"
    >
      {message}
    </div>
  )
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

export function ProgressBar({
  steps,
  current,
}: {
  steps: number
  current: number
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: steps }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i < current
              ? "bg-[#2D6A4F]"
              : i === current
                ? "bg-[#74C69D]"
                : "bg-[#E8E6DF]"
          }`}
        />
      ))}
    </div>
  )
}

// ─── Icon helpers ──────────────────────────────────────────────────────────────

export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string
  size?: number
  className?: string
}) {
  const icons: Record<string, ReactNode> = {
    heart: (
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
    map: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </>
    ),
    home: (
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </>
    ),
    plus: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    ),
    user: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
    bookmark: (
      <>
        <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </>
    ),
    check: (
      <>
        <polyline points="20,6 9,17 4,12" />
      </>
    ),
    x: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    chevronRight: (
      <>
        <polyline points="9,18 15,12 9,6" />
      </>
    ),
    chevronDown: (
      <>
        <polyline points="6,9 12,15 18,9" />
      </>
    ),
    star: (
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    ),
    send: (
      <>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22,2 15,22 11,13 2,9" />
      </>
    ),
    camera: (
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    briefcase: (
      <>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </>
    ),
    list: (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    ),
    sliders: (
      <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </>
    ),
    truck: (
      <>
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16,8 20,8 23,11 23,16 16,16 16,8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </>
    ),
    zap: (
      <>
        <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
      </>
    ),
    trendingUp: (
      <>
        <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
        <polyline points="17,6 23,6 23,12" />
      </>
    ),
    eye: (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    dollar: (
      <>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
    tag: (
      <>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </>
    ),
    mapPin: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88 16.24,7.76" />
      </>
    ),
    award: (
      <>
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </>
    ),
    package: (
      <>
        <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {icons[name]}
    </svg>
  )
}
