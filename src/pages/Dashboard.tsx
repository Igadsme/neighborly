import { useState } from 'react'
import { Card, StatCard, Badge, Button, Avatar, ListingCard, Icon, SectionHeader, TabBar } from '../components/ui'
import { listings } from '../data'

type Page = 'create' | 'listing' | 'messages'

interface DashboardProps {
  onNavigate: (p: Page) => void
}

const activeListings = listings.slice(0, 3).map(l => ({
  ...l,
  stats: {
    views: Math.floor(Math.random() * 300 + 50),
    saves: Math.floor(Math.random() * 40 + 5),
    messages: Math.floor(Math.random() * 12 + 1),
    offers: Math.floor(Math.random() * 5),
  }
}))

const offers = [
  { listing: listings[0], offerer: 'Marcus J.', offerPrice: 625, asking: 650, status: 'pending', time: '2h ago' },
  { listing: listings[2], offerer: 'David C.', offerPrice: 650, asking: 699, status: 'pending', time: '1d ago' },
  { listing: listings[1], offerer: 'Priya P.', offerPrice: 450, asking: 480, status: 'accepted', time: '3d ago' },
]

const meetups = [
  { listing: listings[0].title, with: 'Marcus Johnson', date: 'Sat, Sep 21', time: '2:00 PM', location: 'Publix — Moreland Ave' },
  { listing: listings[2].title, with: 'David Chen', date: 'Sun, Sep 22', time: '11:00 AM', location: 'Starbucks — Edgewood Ave' },
]

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">My dashboard</h1>
            <p className="text-[#8A9AB5] mt-1">Gad Miller · Inman Park</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => onNavigate('create')}>
            <Icon name="plus" size={13} />
            Post listing
          </Button>
        </div>

        {/* Tab bar */}
        <div className="mb-8">
          <TabBar
            tabs={['Overview', 'My Listings', 'Offers', 'Activity']}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Overview tab */}
        {activeTab === 'Overview' && (
          <>
            {/* Trust status */}
            <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2D6A4F] rounded-3xl p-6 mb-8 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70 mb-1 uppercase tracking-wide font-semibold">Account trust level</p>
                  <h2 className="font-display text-3xl font-semibold mb-2">Verified Neighbor 🏆</h2>
                  <p className="text-white/70 text-sm">ID verified · Email confirmed · 52 transactions · 4.9 rating</p>
                </div>
                <div className="text-right hidden md:block">
                  <div className="w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center bg-white/10 text-2xl font-bold">
                    98%
                  </div>
                  <p className="text-xs text-white/60 mt-1">Trust score</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge variant="green">✓ ID Verified</Badge>
                <Badge variant="green">✓ Email confirmed</Badge>
                <Badge variant="blue">⭐ 4.9 star rating</Badge>
                <Badge variant="amber">🏅 52 transactions</Badge>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Active Listings" value="3" sub="2 with offers" icon={<Icon name="tag" size={18} />} color="green" />
              <StatCard label="Total Views" value="624" sub="This month" icon={<Icon name="eye" size={18} />} color="blue" />
              <StatCard label="Messages" value="12" sub="4 unread" icon={<Icon name="message" size={18} />} color="coral" />
              <StatCard label="Earned" value="$1,925" sub="Last 90 days" icon={<Icon name="dollar" size={18} />} color="amber" />
            </div>

            {/* Pending offers */}
            <SectionHeader title="Pending offers" subtitle="Respond within 24 hours to keep your response rate high" />
            <div className="space-y-3 mb-8">
              {offers.filter(o => o.status === 'pending').map((offer, i) => (
                <Card key={i} className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                    <img src={`https://images.unsplash.com/${offer.listing.images[0]}?w=100&h=100&fit=crop&auto=format`} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">{offer.listing.title}</p>
                    <p className="text-xs text-[#8A9AB5]">{offer.offerer} offered <strong className="text-[#1B2A4A]">${offer.offerPrice}</strong> · asking ${offer.asking} · {offer.time}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button className="px-3 py-1.5 bg-[#2D6A4F] text-white text-xs font-semibold rounded-lg hover:bg-[#1B4332] transition-colors">Accept</button>
                    <button className="px-3 py-1.5 bg-white border border-[#E8E6DF] text-[#5C6E8A] text-xs font-semibold rounded-lg hover:bg-[#F5F4EF] transition-colors">Counter</button>
                    <button className="px-3 py-1.5 bg-white border border-[#E8E6DF] text-[#E8694A] text-xs font-semibold rounded-lg hover:bg-[#FDE8E0] transition-colors">Decline</button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Upcoming meetups */}
            <SectionHeader title="Upcoming meetups" />
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {meetups.map((meetup, i) => (
                <Card key={i} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#DDEEFF] flex items-center justify-center flex-shrink-0">
                    <Icon name="calendar" size={18} className="text-[#4A7FB5]" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-[#1B2A4A]">{meetup.with}</p>
                    <p className="text-xs text-[#8A9AB5] mt-0.5">{meetup.date} at {meetup.time}</p>
                    <div className="flex items-center gap-1 text-xs text-[#5C6E8A] mt-1">
                      <Icon name="mapPin" size={10} className="text-[#E8694A]" />
                      {meetup.location}
                    </div>
                    <p className="text-xs text-[#C5CCDA] mt-0.5">Re: {meetup.listing}</p>
                  </div>
                  <button onClick={() => onNavigate('messages')} className="text-xs font-semibold text-[#4A7FB5] flex-shrink-0">Message</button>
                </Card>
              ))}
            </div>

            {/* Reviews to complete */}
            <SectionHeader title="Reviews to complete" subtitle="Leave reviews for recent transactions" />
            <div className="space-y-3">
              {[listings[1], listings[3]].map(listing => (
                <Card key={listing.id} className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                    <img src={`https://images.unsplash.com/${listing.images[0]}?w=80&h=80&fit=crop&auto=format`} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-[#8A9AB5]">Transaction complete</p>
                    <p className="font-semibold text-sm text-[#1B2A4A]">{listing.title}</p>
                  </div>
                  <Button variant="soft" size="xs">Rate {listing.seller.name.split(' ')[0]}</Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* My Listings tab */}
        {activeTab === 'My Listings' && (
          <div className="space-y-4">
            {activeListings.map(listing => (
              <Card key={listing.id} padding="none">
                <div className="flex gap-4 p-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-[#F5F4EF] cursor-pointer" onClick={() => onNavigate('listing')}>
                    <img src={`https://images.unsplash.com/${listing.images[0]}?w=160&h=160&fit=crop&auto=format`} alt={listing.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1 cursor-pointer hover:text-[#2D6A4F]" onClick={() => onNavigate('listing')}>{listing.title}</p>
                      <span className="font-bold text-[#1B2A4A] flex-shrink-0">${listing.price?.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 mb-3">
                      <Badge variant="green" size="sm">Active</Badge>
                      <span className="text-xs text-[#8A9AB5]">Posted {listing.postedAt}</span>
                    </div>

                    {/* Analytics */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Views', value: listing.stats.views, icon: 'eye', color: 'text-[#4A7FB5]' },
                        { label: 'Saves', value: listing.stats.saves, icon: 'heart', color: 'text-[#E8694A]' },
                        { label: 'Messages', value: listing.stats.messages, icon: 'message', color: 'text-[#2D6A4F]' },
                        { label: 'Offers', value: listing.stats.offers, icon: 'dollar', color: 'text-[#D97706]' },
                      ].map(stat => (
                        <div key={stat.label} className="bg-[#F5F4EF] rounded-xl p-2 text-center">
                          <Icon name={stat.icon} size={12} className={`mx-auto mb-0.5 ${stat.color}`} />
                          <p className="font-bold text-sm text-[#1B2A4A]">{stat.value}</p>
                          <p className="text-[9px] text-[#8A9AB5]">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Suggested action */}
                {listing.stats.views > 150 && (
                  <div className="border-t border-[#F5F4EF] px-4 py-3 bg-[#FFFBEB] flex items-center justify-between">
                    <p className="text-xs text-[#92400E]">💡 High interest! Consider lowering by 10% to close faster.</p>
                    <button className="text-xs font-semibold text-[#D97706]">Adjust price</button>
                  </div>
                )}

                <div className="border-t border-[#F5F4EF] px-4 py-3 flex gap-2">
                  <Button variant="outline" size="xs" onClick={() => onNavigate('listing')}>Edit</Button>
                  <Button variant="ghost" size="xs">Pause</Button>
                  <Button variant="secondary" size="xs">🚀 Promote</Button>
                  <button className="ml-auto text-xs text-[#C5CCDA] hover:text-[#E8694A] transition-colors">Mark sold</button>
                </div>
              </Card>
            ))}

            <button onClick={() => onNavigate('create')} className="w-full py-4 border-2 border-dashed border-[#E8E6DF] rounded-2xl text-sm text-[#8A9AB5] hover:border-[#2D6A4F] hover:text-[#2D6A4F] transition-all flex items-center justify-center gap-2">
              <Icon name="plus" size={16} />
              Post a new listing
            </button>
          </div>
        )}

        {/* Offers tab */}
        {activeTab === 'Offers' && (
          <div className="space-y-4">
            <div className="flex gap-2 mb-2">
              {['Received', 'Sent', 'Accepted', 'Declined'].map(t => (
                <button key={t} className="px-3 py-1.5 text-xs font-medium rounded-full border border-[#E8E6DF] text-[#5C6E8A] hover:border-[#2D6A4F] hover:text-[#2D6A4F] transition-colors bg-white">
                  {t}
                </button>
              ))}
            </div>
            {offers.map((offer, i) => (
              <Card key={i} className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                  <img src={`https://images.unsplash.com/${offer.listing.images[0]}?w=100&h=100&fit=crop&auto=format`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-[#1B2A4A]">{offer.listing.title}</p>
                  <p className="text-xs text-[#8A9AB5]">{offer.offerer} · {offer.time}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-bold text-[#1B2A4A]">${offer.offerPrice}</span>
                    <span className="text-xs text-[#C5CCDA]">of</span>
                    <span className="text-sm text-[#8A9AB5]">${offer.asking} asking</span>
                  </div>
                </div>
                <Badge variant={offer.status === 'accepted' ? 'green' : offer.status === 'pending' ? 'amber' : 'coral'}>
                  {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                </Badge>
              </Card>
            ))}
          </div>
        )}

        {/* Activity tab */}
        {activeTab === 'Activity' && (
          <div className="space-y-3">
            {[
              { icon: '💬', text: 'Marcus Johnson sent you a message about West Elm Sofa', time: '10 min ago', type: 'message' },
              { icon: '💰', text: 'New offer: $650 for iPhone 14 Pro from David C.', time: '1h ago', type: 'offer' },
              { icon: '👀', text: 'Your West Elm Sofa was viewed 23 times today', time: '2h ago', type: 'view' },
              { icon: '❤️', text: 'Priya Patel saved your Standing Desk listing', time: '4h ago', type: 'save' },
              { icon: '⭐', text: 'You received a 5-star review from James Rivera', time: '1d ago', type: 'review' },
              { icon: '✅', text: 'Transaction completed: Trek Marlin 7 sold for $560', time: '2d ago', type: 'sold' },
              { icon: '🚀', text: 'Your listing promotion has 3 days remaining', time: '3d ago', type: 'promo' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-[#E8E6DF]">
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-sm text-[#1B2A4A]">{item.text}</p>
                  <p className="text-xs text-[#C5CCDA] mt-0.5">{item.time}</p>
                </div>
                {item.type === 'message' && <button onClick={() => onNavigate('messages')} className="text-xs text-[#4A7FB5] font-medium flex-shrink-0">Reply →</button>}
                {item.type === 'offer' && <button className="text-xs text-[#2D6A4F] font-medium flex-shrink-0">View offer →</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
