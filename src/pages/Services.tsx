import { useEffect, useState } from 'react'
import { Avatar, StarRating, Badge, Button, Icon, InlineAlert, LoadState } from '../components/ui'
import { api, readStatus } from '../api/client'
import { mediaSrc } from '../lib/view'
import { serviceCard, type ServiceCard } from '../lib/verticals'

interface ServicesProps {
  onNavigate: (p: 'messages', id?: string) => void
}

const serviceCategories = [
  { emoji: '🧹', label: 'Cleaning' },
  { emoji: '📦', label: 'Moving' },
  { emoji: '📚', label: 'Tutoring' },
  { emoji: '🔧', label: 'Repair' },
  { emoji: '📷', label: 'Photography' },
  { emoji: '🌱', label: 'Lawn Care' },
  { emoji: '💻', label: 'Tech Help' },
  { emoji: '🏋️', label: 'Fitness' },
  { emoji: '🎨', label: 'Design' },
  { emoji: '🍳', label: 'Cooking' },
]

export default function Services({ onNavigate }: ServicesProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [query, setQuery] = useState('')
  const [showBooking, setShowBooking] = useState(false)
  const [bookingService, setBookingService] = useState<ServiceCard | null>(null)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [bookingAddress, setBookingAddress] = useState('')
  const [bookingSent, setBookingSent] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [sending, setSending] = useState(false)
  const [rows, setRows] = useState<ServiceCard[]>([])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [messagingId, setMessagingId] = useState<string | null>(null)
  const [providerOpen, setProviderOpen] = useState(false)
  const [providerTitle, setProviderTitle] = useState('')
  const [providerBusiness, setProviderBusiness] = useState('')
  const [providerDescription, setProviderDescription] = useState('')
  const [providerCategory, setProviderCategory] = useState('Cleaning')
  const [providerPrice, setProviderPrice] = useState('')
  const [providerLocation, setProviderLocation] = useState('')
  const [providerAvailability, setProviderAvailability] = useState('')
  const [providerError, setProviderError] = useState('')
  const [providerSending, setProviderSending] = useState(false)
  const [providerSent, setProviderSent] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.services
      .list({
        query: query.trim() || undefined,
        category: activeCategory || undefined,
        limit: 100,
      })
      .then((list) => {
        if (!active) return
        setRows(list.map(serviceCard))
        if (!activeCategory && !query.trim()) {
          const next: Record<string, number> = {}
          for (const row of list) next[row.category] = (next[row.category] ?? 0) + 1
          setCategoryCounts(next)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(readStatus(cause, 'Services could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [activeCategory, query, reloadKey])

  const messageProvider = async (svc: ServiceCard) => {
    setMessagingId(svc.id)
    setActionNote('')
    try {
      const result = await api.conversations.create({
        participantId: svc.ownerId,
        body: `Hi, I'm interested in "${svc.title}".`,
      })
      onNavigate('messages', result.conversation.id)
    } catch (cause: unknown) {
      setActionNote(readStatus(cause, 'Unable to message this provider.'))
    } finally {
      setMessagingId(null)
    }
  }

  const openBooking = (svc: ServiceCard) => {
    setBookingService(svc)
    setBookingDate('')
    setBookingTime('')
    setBookingNotes('')
    setBookingAddress('')
    setBookingError('')
    setBookingSent(false)
    setShowBooking(true)
  }

  const sendRequest = async () => {
    if (!bookingService || sending) return
    if (bookingNotes.trim().length < 2) {
      setBookingError('Tell them a bit more about what you need.')
      return
    }
    setSending(true)
    setBookingError('')
    try {
      await api.services.requestQuote(bookingService.id, {
        notes: bookingNotes.trim(),
        preferredDate: bookingDate || undefined,
        preferredTime: bookingTime || undefined,
        address: bookingAddress.trim() || undefined,
      })
      setBookingSent(true)
      window.setTimeout(() => {
        setShowBooking(false)
        setBookingSent(false)
        setSending(false)
      }, 1800)
    } catch (cause: unknown) {
      setBookingError(readStatus(cause, 'Unable to send this quote request.'))
      setSending(false)
    }
  }

  const publishService = async () => {
    const dollars = Number(providerPrice)
    if (providerTitle.trim().length < 3 || providerBusiness.trim().length < 2 || providerDescription.trim().length < 10) {
      setProviderError('Add a title, business name, and a description of at least 10 characters.')
      return
    }
    if (!Number.isFinite(dollars) || dollars < 0) {
      setProviderError('Enter a starting price.')
      return
    }
    if (providerLocation.trim().length < 2 || providerAvailability.trim().length < 2) {
      setProviderError('Add a location and availability.')
      return
    }
    setProviderSending(true)
    setProviderError('')
    try {
      await api.services.create({
        title: providerTitle.trim(),
        businessName: providerBusiness.trim(),
        description: providerDescription.trim(),
        category: providerCategory,
        startingPriceCents: Math.round(dollars * 100),
        location: providerLocation.trim(),
        availability: providerAvailability.trim(),
      })
      setProviderSent(true)
      window.setTimeout(() => {
        setProviderOpen(false)
        setProviderSent(false)
        setProviderSending(false)
        setReloadKey((key) => key + 1)
      }, 1200)
    } catch (cause: unknown) {
      setProviderError(readStatus(cause, 'Unable to publish this service.'))
      setProviderSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1B2A4A] to-[#2D6A4F] py-12 px-4 md:px-6 text-center">
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-white mb-3">Local services</h1>
        <p className="text-white/70 text-lg mb-6 max-w-xl mx-auto">Hire trusted neighbors for cleaning, moving, tutoring, repairs, and more.</p>
        <div className="relative max-w-lg mx-auto">
          <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C5CCDA]" />
          <input
            type="text"
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setQuery(searchDraft) }}
            placeholder="What service do you need?"
            className="w-full h-13 pl-12 pr-36 bg-white rounded-2xl text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none shadow-md"
          />
          <button
            onClick={() => setQuery(searchDraft)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#E8694A] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#C4512D] transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${!activeCategory ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/30'}`}
          >
            All services
          </button>
          {serviceCategories.map(cat => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${activeCategory === cat.label ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/30'}`}
            >
              {cat.emoji} {cat.label}
              <span className={`text-xs ${activeCategory === cat.label ? 'text-white/70' : 'text-[#C5CCDA]'}`}>({categoryCounts[cat.label] ?? 0})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <LoadState loading loadingLabel="Loading services…" />
        ) : error ? (
          <LoadState error={error} loadingLabel="Loading services…" />
        ) : rows.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-5xl mb-4">🔧</div>
            <h3 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">No services match your search</h3>
            <p className="text-[#8A9AB5]">Try another category or keyword.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rows.map(svc => {
              const photo = mediaSrc(svc.image, 'w=600&h=400&fit=crop&auto=format')
              return (
                <div
                  key={svc.id}
                  className="bg-white rounded-3xl border border-[#E8E6DF] overflow-hidden card-hover"
                >
                  {/* Service image */}
                  <div className="relative h-44 bg-[#F5F4EF] overflow-hidden">
                    {photo && (
                      <img
                        src={photo}
                        alt={svc.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {svc.backgroundCheck && (
                      <div className="absolute top-3 left-3">
                        <Badge variant="green">🔍 BG Check</Badge>
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={() => setActionNote("Saving services isn't available yet.")}
                        className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
                        aria-label="Save service"
                      >
                        <Icon name="heart" size={14} className="stroke-[#5C6E8A]" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {/* Provider */}
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar src={svc.avatar} name={svc.providerName} size="sm" verified />
                      <div>
                        <p className="font-semibold text-sm text-[#1B2A4A]">{svc.providerName}</p>
                        <p className="text-xs text-[#8A9AB5]">{svc.location}</p>
                      </div>
                    </div>

                    <h3 className="font-display text-lg font-semibold text-[#1B2A4A] mb-1">{svc.title}</h3>

                    <div className="flex items-center gap-2 mb-3">
                      <StarRating rating={svc.rating} count={svc.reviews} size="sm" />
                      <span className="text-[#C5CCDA]">·</span>
                      <span className="text-xs text-[#8A9AB5]">{svc.availability}</span>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {svc.tags.map(tag => (
                        <Badge key={tag} variant="gray" size="sm">{tag}</Badge>
                      ))}
                    </div>

                    {/* Price + CTA */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#F5F4EF]">
                      <div>
                        <span className="text-xs text-[#8A9AB5]">Starting at</span>
                        <p className="font-bold text-[#1B2A4A]">${svc.startingPrice.toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={messagingId === svc.id}
                          onClick={() => void messageProvider(svc)}
                          className="text-xs font-semibold text-[#5C6E8A] bg-[#F5F4EF] px-3 py-2 rounded-xl hover:bg-[#EEF0F5] transition-colors disabled:opacity-40"
                        >
                          {messagingId === svc.id ? 'Sending...' : 'Message'}
                        </button>
                        <Button variant="primary" size="sm" onClick={() => openBooking(svc)}>
                          Request quote
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Become a provider CTA */}
        <div className="mt-10 bg-gradient-to-r from-[#FDE8E0] to-[#FFF5F2] border border-[#E8694A]/20 rounded-3xl p-8 text-center">
          <div className="text-4xl mb-3">🔧</div>
          <h2 className="font-display text-2xl font-semibold text-[#1B2A4A] mb-2">Offer your services on Neighborly</h2>
          <p className="text-[#5C6E8A] mb-5 max-w-md mx-auto">List a service neighbors can request. Set your own rate, location, and availability.</p>
          <InlineAlert message={actionNote} />
          <Button variant="secondary" size="lg" onClick={() => { setProviderError(''); setProviderSent(false); setProviderOpen(true) }}>Become a provider →</Button>
        </div>
      </div>

      {/* Booking modal */}
      {showBooking && bookingService && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-semibold text-[#1B2A4A]">Request a quote</h3>
              <button onClick={() => setShowBooking(false)} className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center">
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-[#F5F4EF] rounded-xl mb-5">
              <Avatar src={bookingService.avatar} name={bookingService.providerName} size="sm" verified />
              <div>
                <p className="font-semibold text-sm text-[#1B2A4A]">{bookingService.providerName}</p>
                <p className="text-xs text-[#8A9AB5]">{bookingService.title} · from ${bookingService.startingPrice.toLocaleString()}</p>
              </div>
            </div>

            {bookingSent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-[#1B2A4A]">Request sent!</p>
                <p className="text-sm text-[#8A9AB5]">You'll hear back within {bookingService.availability}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">Preferred date</label>
                    <input
                      type="date"
                      value={bookingDate}
                      onChange={e => setBookingDate(e.target.value)}
                      className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">Time</label>
                    <select value={bookingTime} onChange={e => setBookingTime(e.target.value)} className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]">
                      <option value="">Select time</option>
                      {['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">Tell them about your needs</label>
                  <textarea
                    value={bookingNotes}
                    onChange={e => setBookingNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. 2BR apartment, deep clean needed before move-in..."
                    className="w-full p-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:border-[#2D6A4F] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">Your address</label>
                  <input
                    type="text"
                    value={bookingAddress}
                    onChange={e => setBookingAddress(e.target.value)}
                    placeholder="Street address (only shared after booking confirmed)"
                    className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                  />
                </div>
                <p className="text-xs text-[#8A9AB5] flex items-center gap-1.5">
                  <Icon name="shield" size={11} className="text-[#2D6A4F]" />
                  Your contact info is only shared after the provider accepts your request.
                </p>
                <InlineAlert message={bookingError} />
                <Button variant="primary" size="lg" fullWidth disabled={sending} onClick={() => void sendRequest()}>
                  {sending ? 'Sending...' : 'Send request →'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {providerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-semibold text-[#1B2A4A]">Become a provider</h3>
              <button onClick={() => setProviderOpen(false)} className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center">
                <Icon name="x" size={14} />
              </button>
            </div>
            {providerSent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-semibold text-[#1B2A4A]">Service published</p>
                <p className="text-sm text-[#8A9AB5]">Neighbors can request a quote.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} placeholder="Service title" className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm" />
                <input value={providerBusiness} onChange={(event) => setProviderBusiness(event.target.value)} placeholder="Business name" className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm" />
                <select value={providerCategory} onChange={(event) => setProviderCategory(event.target.value)} className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm">
                  {serviceCategories.map((cat) => <option key={cat.label}>{cat.label}</option>)}
                </select>
                <textarea value={providerDescription} onChange={(event) => setProviderDescription(event.target.value)} rows={3} placeholder="What do you offer?" className="w-full p-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm resize-none" />
                <input value={providerPrice} onChange={(event) => setProviderPrice(event.target.value)} placeholder="Starting price in dollars" className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm" />
                <input value={providerLocation} onChange={(event) => setProviderLocation(event.target.value)} placeholder="Location" className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm" />
                <input value={providerAvailability} onChange={(event) => setProviderAvailability(event.target.value)} placeholder="Availability" className="w-full h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm" />
                <InlineAlert message={providerError} />
                <Button variant="primary" size="lg" fullWidth disabled={providerSending} onClick={() => void publishService()}>
                  {providerSending ? 'Publishing...' : 'Publish service'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
