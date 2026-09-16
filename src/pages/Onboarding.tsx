import { useState } from "react"
import { Button, ProgressBar, Toggle, Icon } from "../components/ui"
import { api, ApiError } from "../api/client"

interface OnboardingProps {
  onComplete: () => void
}

const interests = [
  { id: "buy-sell", emoji: "🛒", label: "Buy & Sell" },
  { id: "housing", emoji: "🏠", label: "Housing" },
  { id: "jobs", emoji: "💼", label: "Jobs" },
  { id: "services", emoji: "🔧", label: "Local Services" },
  { id: "free", emoji: "🎁", label: "Free Items" },
  { id: "events", emoji: "🎭", label: "Events" },
  { id: "lost-found", emoji: "🔍", label: "Lost & Found" },
  { id: "community", emoji: "🌳", label: "Community" },
  { id: "pets", emoji: "🐾", label: "Pets" },
  { id: "vehicles", emoji: "🚗", label: "Vehicles" },
]

const neighborhoods = [
  "Inman Park",
  "Decatur",
  "Midtown",
  "Buckhead",
  "Grant Park",
  "Little Five Points",
  "East Atlanta",
  "Westside",
  "Ponce City Market Area",
  "Candler Park",
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [method, setMethod] = useState<"google" | "apple" | "email" | null>(
    null,
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [locationGranted, setLocationGranted] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "buy-sell",
    "services",
  ])
  const [notifications, setNotifications] = useState({
    newListings: true,
    priceDrops: true,
    messages: true,
    events: false,
    community: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const steps = ["Account", "Location", "Interests", "Notifications", "Done!"]

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }

  const next = async () => {
    setError("")
    if (step === 0) {
      if (method !== "email") {
        setError(
          "Social sign-in is not connected yet. Continue with email to create your account.",
        )
        return
      }
      const [firstName, ...lastNameParts] = fullName.trim().split(/\s+/)
      if (
        !email ||
        password.length < 12 ||
        !firstName ||
        lastNameParts.length === 0
      ) {
        setError(
          "Enter your email, a 12-character password, and your full name.",
        )
        return
      }
      setSaving(true)
      try {
        await api.auth.register({
          email,
          password,
          firstName,
          lastName: lastNameParts.join(" "),
        })
        setStep(1)
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Unable to create your account. Please try again.",
        )
      } finally {
        setSaving(false)
      }
      return
    }
    if (step === 3) {
      setSaving(true)
      try {
        await api.auth.completeOnboarding({
          neighborhood:
            neighborhood || (locationGranted ? "Inman Park" : undefined),
          city: "Atlanta",
          state: "GA",
          interests: selectedInterests,
          capabilities: ["buy", "sell"],
          ...notifications,
        })
        setStep(4)
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Unable to save your preferences. Please try again.",
        )
      } finally {
        setSaving(false)
      }
      return
    }
    if (step < 4) setStep(step + 1)
    else onComplete()
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex">
      {/* Left panel — illustration */}
      <div className="hidden lg:flex lg:w-2/5 relative">
        <img
          src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=1000&fit=crop&auto=format"
          alt="Neighborhood"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A4A]/80 via-[#1B2A4A]/30 to-transparent" />
        <div className="absolute bottom-12 left-10 right-10 text-white">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                  fill="white"
                />
              </svg>
            </div>
            <span className="font-display font-semibold text-lg">
              Neighborly
            </span>
          </div>
          <h2 className="font-display text-3xl font-semibold mb-3">
            Your neighborhood,
            <br />
            your community.
          </h2>
          <p className="text-white/70 leading-relaxed">
            Join 47,000+ neighbors buying, selling, and connecting across
            Atlanta.
          </p>
          <div className="flex items-center gap-4 mt-6">
            {[
              "photo-1472099645785-5658abf4ff4e",
              "photo-1494790108755-2616b612b77c",
              "photo-1438761681033-6461ffad8d80",
              "photo-1500648767791-00dcc994a43e",
            ].map((src, i) => (
              <img
                key={i}
                src={`https://images.unsplash.com/${src}?w=60&h=60&fit=crop&auto=format`}
                alt=""
                className="w-10 h-10 rounded-full border-2 border-white object-cover -ml-3 first:ml-0"
              />
            ))}
            <span className="text-sm text-white/70 ml-1">+47k neighbors</span>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="w-7 h-7 rounded-lg bg-[#2D6A4F] flex items-center justify-center">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                    fill="white"
                  />
                </svg>
              </div>
              <span className="font-display font-semibold text-[#1B2A4A]">
                Neighborly
              </span>
            </div>
            <button
              onClick={next}
              className="text-sm text-[#8A9AB5] hover:text-[#1B2A4A] ml-auto"
            >
              {step < 4 ? "Skip for now" : ""}
            </button>
          </div>
          <ProgressBar steps={5} current={step} />
          <div className="flex justify-between mt-2">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`text-xs font-medium transition-colors ${
                  i === step
                    ? "text-[#2D6A4F]"
                    : i < step
                      ? "text-[#74C69D]"
                      : "text-[#C5CCDA]"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="w-full max-w-md animate-fade-in">
            {/* Step 0: Account creation */}
            {step === 0 && (
              <div>
                <h1 className="font-display text-3xl font-semibold text-[#1B2A4A] mb-2">
                  Create your account
                </h1>
                <p className="text-[#8A9AB5] mb-8">
                  Free to join. No credit card required.
                </p>

                {!method ? (
                  <div className="space-y-3">
                    <button
                      onClick={() =>
                        setError(
                          "Google sign-in is not connected yet. Continue with email to create your account.",
                        )
                      }
                      className="w-full flex items-center gap-4 p-4 bg-white border border-[#E8E6DF] rounded-xl hover:border-[#2D6A4F] transition-all text-left group"
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      <span className="font-semibold text-[#1B2A4A]">
                        Continue with Google
                      </span>
                    </button>
                    <button
                      onClick={() =>
                        setError(
                          "Apple sign-in is not connected yet. Continue with email to create your account.",
                        )
                      }
                      className="w-full flex items-center gap-4 p-4 bg-[#1B2A4A] border border-[#1B2A4A] rounded-xl hover:bg-[#243760] transition-all text-left"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="22"
                        height="22"
                        fill="white"
                      >
                        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-3.969 2.523-6.07 5.014-6.07 1.307 0 2.389.856 3.232.856.786 0 2.013-.901 3.479-.901.568 0 2.607.08 3.944 2.027zm-8.198-2.148c.593 0 1.07-.406 1.07-1.003 0-.621-.487-1.074-1.07-1.074-.584 0-1.072.453-1.072 1.074 0 .597.478 1.003 1.072 1.003z" />
                      </svg>
                      <span className="font-semibold text-white">
                        Continue with Apple
                      </span>
                    </button>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-[#E8E6DF]" />
                      <span className="text-xs text-[#C5CCDA] font-medium">
                        or
                      </span>
                      <div className="flex-1 h-px bg-[#E8E6DF]" />
                    </div>
                    <button
                      onClick={() => setMethod("email")}
                      className="w-full flex items-center gap-4 p-4 bg-white border border-[#E8E6DF] rounded-xl hover:border-[#2D6A4F] transition-all text-left"
                    >
                      <Icon
                        name="message"
                        size={20}
                        className="text-[#8A9AB5]"
                      />
                      <span className="font-semibold text-[#1B2A4A]">
                        Continue with email
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                        Email address
                      </label>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-12 px-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        placeholder="Create a strong password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-12 px-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                        Full name
                      </label>
                      <input
                        type="text"
                        placeholder="Your name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full h-12 px-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] transition-all"
                      />
                    </div>
                    <p className="text-xs text-[#8A9AB5]">
                      By continuing, you agree to our{" "}
                      <a href="#" className="text-[#2D6A4F] font-medium">
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a href="#" className="text-[#2D6A4F] font-medium">
                        Privacy Policy
                      </a>
                      .
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div
                className="mt-5 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Step 1: Location */}
            {step === 1 && (
              <div>
                <h1 className="font-display text-3xl font-semibold text-[#1B2A4A] mb-2">
                  Where do you live?
                </h1>
                <p className="text-[#8A9AB5] mb-8">
                  We'll show you listings and neighbors that are closest to you.
                  Your exact address is never shared.
                </p>

                <button
                  onClick={() => setLocationGranted(true)}
                  className={`w-full p-5 rounded-2xl border-2 transition-all mb-4 text-left ${
                    locationGranted
                      ? "border-[#2D6A4F] bg-[#F0FBF3]"
                      : "border-[#E8E6DF] bg-white hover:border-[#2D6A4F]/50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#D8F3DC] flex items-center justify-center text-2xl flex-shrink-0">
                      {locationGranted ? "✅" : "📍"}
                    </div>
                    <div>
                      <p className="font-semibold text-[#1B2A4A]">
                        {locationGranted
                          ? "Location detected"
                          : "Allow location access"}
                      </p>
                      <p className="text-sm text-[#8A9AB5]">
                        {locationGranted
                          ? "Inman Park, Atlanta, GA"
                          : "Automatically find your neighborhood"}
                      </p>
                    </div>
                  </div>
                </button>

                <p className="text-xs text-center text-[#C5CCDA] mb-4">
                  — or choose your neighborhood —
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {neighborhoods.map((n) => (
                    <button
                      key={n}
                      onClick={() => setNeighborhood(n)}
                      className={`p-3 rounded-xl border text-sm font-medium text-left transition-all ${
                        neighborhood === n
                          ? "border-[#2D6A4F] bg-[#F0FBF3] text-[#2D6A4F]"
                          : "border-[#E8E6DF] bg-white text-[#1B2A4A] hover:border-[#C5CCDA]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Interests */}
            {step === 2 && (
              <div>
                <h1 className="font-display text-3xl font-semibold text-[#1B2A4A] mb-2">
                  What brings you here?
                </h1>
                <p className="text-[#8A9AB5] mb-8">
                  Select all that apply — we'll personalize your feed
                  accordingly.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {interests.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleInterest(item.id)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        selectedInterests.includes(item.id)
                          ? "border-[#2D6A4F] bg-[#F0FBF3]"
                          : "border-[#E8E6DF] bg-white hover:border-[#C5CCDA]"
                      }`}
                    >
                      <span className="text-2xl">{item.emoji}</span>
                      <span
                        className={`text-sm font-semibold ${
                          selectedInterests.includes(item.id)
                            ? "text-[#2D6A4F]"
                            : "text-[#1B2A4A]"
                        }`}
                      >
                        {item.label}
                      </span>
                      {selectedInterests.includes(item.id) && (
                        <span className="ml-auto text-[#2D6A4F]">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Notifications */}
            {step === 3 && (
              <div>
                <h1 className="font-display text-3xl font-semibold text-[#1B2A4A] mb-2">
                  Stay in the loop
                </h1>
                <p className="text-[#8A9AB5] mb-8">
                  Choose what matters to you. You can change these anytime in
                  Settings.
                </p>
                <div className="space-y-4">
                  {[
                    {
                      key: "newListings",
                      label: "New listings nearby",
                      sub: "Get notified when listings match your searches",
                    },
                    {
                      key: "priceDrops",
                      label: "Price drops",
                      sub: "When saved items drop in price",
                    },
                    {
                      key: "messages",
                      label: "Messages",
                      sub: "Replies from sellers and buyers",
                    },
                    {
                      key: "events",
                      label: "Community events",
                      sub: "What's happening in your neighborhood",
                    },
                    {
                      key: "community",
                      label: "Community posts",
                      sub: "Discussions and announcements nearby",
                    },
                  ].map(({ key, label, sub }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-4 bg-white rounded-xl border border-[#E8E6DF]"
                    >
                      <div>
                        <p className="font-medium text-sm text-[#1B2A4A]">
                          {label}
                        </p>
                        <p className="text-xs text-[#8A9AB5] mt-0.5">{sub}</p>
                      </div>
                      <Toggle
                        checked={
                          notifications[(key as keyof typeof notifications)]
                        }
                        onChange={(v) =>
                          setNotifications((prev) => ({ ...prev, [key]: v }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Done */}
            {step === 4 && (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-[#D8F3DC] flex items-center justify-center mx-auto mb-6 text-4xl">
                  🎉
                </div>
                <h1 className="font-display text-4xl font-semibold text-[#1B2A4A] mb-3">
                  You're all set, Gad!
                </h1>
                <p className="text-[#5C6E8A] mb-8 leading-relaxed">
                  Welcome to Neighborly. Your personalized feed is ready with
                  listings, neighbors, and community content near Inman Park.
                </p>
                <div className="grid grid-cols-3 gap-3 mb-8">
                  <div className="bg-[#F0FBF3] rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold font-display text-[#2D6A4F]">
                      3.2k
                    </p>
                    <p className="text-xs text-[#5C6E8A] mt-0.5">
                      Nearby listings
                    </p>
                  </div>
                  <div className="bg-[#FFF5F2] rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold font-display text-[#E8694A]">
                      47k
                    </p>
                    <p className="text-xs text-[#5C6E8A] mt-0.5">Neighbors</p>
                  </div>
                  <div className="bg-[#F0F7FF] rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold font-display text-[#4A7FB5]">
                      Free
                    </p>
                    <p className="text-xs text-[#5C6E8A] mt-0.5">To use</p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8">
              {step > 0 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="text-sm font-medium text-[#8A9AB5] hover:text-[#1B2A4A] transition-colors flex items-center gap-1"
                >
                  <Icon name="chevronRight" size={14} className="rotate-180" />{" "}
                  Back
                </button>
              ) : (
                <div />
              )}
              <Button
                variant="primary"
                size="lg"
                onClick={next}
                disabled={saving}
                className="px-8"
              >
                {saving
                  ? "Saving..."
                  : step === 4
                    ? "Go to my feed →"
                    : step === 3
                      ? "Finish setup →"
                      : "Continue →"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
