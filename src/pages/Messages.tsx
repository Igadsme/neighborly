import { useState } from 'react'
import { Avatar, Badge, Button, Icon } from '../components/ui'
import { conversations } from '../data'

type Conversation = typeof conversations[0]

export default function Messages() {
  const [selected, setSelected] = useState<string>(conversations[0].id)
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState(conversations[0].messages)
  const [filter, setFilter] = useState<'all' | 'active' | 'archived' | 'transactions'>('all')
  const [showScamWarning, setShowScamWarning] = useState(false)
  const [offerStatus, setOfferStatus] = useState<'pending' | 'accepted' | 'declined'>('pending')

  const activeConversation = conversations.find(c => c.id === selected) || conversations[0]

  const filteredConversations = conversations.filter(c => {
    if (filter === 'active') return c.status === 'active'
    if (filter === 'archived') return c.status === 'archived'
    return true
  })

  const sendMessage = () => {
    if (!newMessage.trim()) return
    const suspicious = newMessage.toLowerCase().includes('venmo') || newMessage.toLowerCase().includes('zelle') || newMessage.toLowerCase().includes('paypal')
    if (suspicious) {
      setShowScamWarning(true)
    } else {
      setMessages([...messages, { id: `msg${Date.now()}`, from: 'me', text: newMessage, time: 'Just now' }])
      setNewMessage('')
    }
  }

  const transactionSteps = ['Offer sent', 'Offer accepted', 'Meetup scheduled', 'Item exchanged', 'Review requested']
  const currentStep = 1

  return (
    <div className="h-[calc(100vh-64px)] flex bg-[#FAFAF7]">

      {/* Conversation list */}
      <div className={`w-full md:w-80 md:flex-shrink-0 flex flex-col bg-white border-r border-[#E8E6DF] ${selected ? 'hidden md:flex' : 'flex'}`}>

        {/* List header */}
        <div className="p-4 border-b border-[#E8E6DF]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display text-xl font-semibold text-[#1B2A4A]">Messages</h1>
            <button className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center hover:bg-[#E8E6DF] transition-colors">
              <Icon name="plus" size={15} className="text-[#5C6E8A]" />
            </button>
          </div>
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C5CCDA]" />
            <input
              type="text"
              placeholder="Search messages..."
              className="w-full h-9 pl-9 pr-3 bg-[#F5F4EF] rounded-xl text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none"
            />
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1 mt-3">
            {(['all', 'active', 'archived', 'transactions'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-[#2D6A4F] text-white' : 'text-[#8A9AB5] hover:text-[#1B2A4A]'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => { setSelected(conv.id); setMessages(conv.messages) }}
              className={`flex items-start gap-3 p-4 cursor-pointer border-b border-[#F5F4EF] hover:bg-[#F5F4EF] transition-colors ${selected === conv.id ? 'bg-[#F0FBF3]' : ''}`}
            >
              <div className="relative flex-shrink-0">
                <Avatar src={conv.with.avatar} name={conv.with.name} size="md" verified={conv.with.verified} />
                {conv.status === 'active' && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#74C69D] rounded-full border-2 border-white" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-sm text-[#1B2A4A]">{conv.with.name}</p>
                  <span className="text-xs text-[#C5CCDA] flex-shrink-0">{conv.lastTime}</span>
                </div>
                {/* Listing preview */}
                <p className="text-xs text-[#8A9AB5] mb-1 truncate">Re: {conv.listing.title}</p>
                <p className={`text-xs truncate ${conv.unread > 0 ? 'font-semibold text-[#1B2A4A]' : 'text-[#8A9AB5]'}`}>{conv.lastMessage}</p>
              </div>

              {conv.unread > 0 && (
                <span className="w-5 h-5 bg-[#E8694A] text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">{conv.unread}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat window */}
      {activeConversation && (
        <div className={`flex-1 flex flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>

          {/* Chat header */}
          <div className="flex items-center gap-3 p-4 bg-white border-b border-[#E8E6DF]">
            <button className="md:hidden text-[#8A9AB5] mr-1" onClick={() => setSelected('')}>
              <Icon name="chevronRight" size={18} className="rotate-180" />
            </button>
            <Avatar src={activeConversation.with.avatar} name={activeConversation.with.name} size="md" verified={activeConversation.with.verified} />
            <div className="flex-1">
              <p className="font-semibold text-sm text-[#1B2A4A]">{activeConversation.with.name}</p>
              <div className="flex items-center gap-2 text-xs text-[#8A9AB5]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#74C69D]" />
                Active · responds in {activeConversation.with.responseTime}
              </div>
            </div>

            {/* Listing preview in header */}
            <div onClick={() => {}} className="hidden md:flex items-center gap-2 px-3 py-2 bg-[#F5F4EF] rounded-xl cursor-pointer hover:bg-[#EEF0F5] transition-colors">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#E8E6DF]">
                <img src={`https://images.unsplash.com/${activeConversation.listing.images[0]}?w=60&h=60&fit=crop&auto=format`} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#1B2A4A] line-clamp-1 max-w-[120px]">{activeConversation.listing.title}</p>
                <p className="text-xs text-[#2D6A4F] font-semibold">${activeConversation.listing.price?.toLocaleString()}</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-full hover:bg-[#F5F4EF] flex items-center justify-center text-[#8A9AB5] transition-colors">
                <Icon name="shield" size={16} />
              </button>
              <button className="w-8 h-8 rounded-full hover:bg-[#F5F4EF] flex items-center justify-center text-[#8A9AB5] transition-colors">
                <Icon name="sliders" size={16} />
              </button>
            </div>
          </div>

          {/* Transaction status */}
          {activeConversation.id === conversations[0].id && (
            <div className="bg-[#F0FBF3] border-b border-[#74C69D]/20 px-4 py-3">
              <p className="text-xs font-semibold text-[#2D6A4F] mb-2 uppercase tracking-wide">Transaction progress</p>
              <div className="flex items-center justify-between">
                {transactionSteps.map((step, i) => (
                  <div key={step} className="flex items-center">
                    <div className={`flex flex-col items-center ${i < transactionSteps.length - 1 ? 'flex-1' : ''}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 ${
                        i < currentStep ? 'bg-[#2D6A4F] border-[#2D6A4F] text-white' :
                        i === currentStep ? 'bg-white border-[#2D6A4F] text-[#2D6A4F]' :
                        'bg-white border-[#E8E6DF] text-[#C5CCDA]'
                      }`}>
                        {i < currentStep ? '✓' : i + 1}
                      </div>
                      <p className="text-[8px] text-[#8A9AB5] mt-0.5 text-center hidden md:block leading-tight max-w-[60px]">{step}</p>
                    </div>
                    {i < transactionSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 ${i < currentStep ? 'bg-[#2D6A4F]' : 'bg-[#E8E6DF]'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F4EF]">
            {/* Date divider */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-[#E8E6DF]" />
              <span className="text-xs text-[#C5CCDA] font-medium">Today</span>
              <div className="flex-1 h-px bg-[#E8E6DF]" />
            </div>

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'} gap-2`}>
                {msg.from !== 'me' && (
                  <Avatar src={activeConversation.with.avatar} name={activeConversation.with.name} size="xs" className="mt-auto" />
                )}
                <div className={`max-w-[75%] flex flex-col ${msg.from === 'me' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2.5 text-sm leading-relaxed ${msg.from === 'me' ? 'msg-bubble-sent' : 'msg-bubble-recv'}`}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-[#C5CCDA] mt-1 px-1">{msg.time}</span>
                </div>
              </div>
            ))}

            {/* Offer card */}
            {activeConversation.id === conversations[0].id && (
              <div className="flex justify-center">
                <div className="bg-white rounded-2xl border border-[#E8E6DF] p-4 max-w-xs w-full shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon name="dollar" size={14} className="text-[#E8694A]" />
                    <span className="text-xs font-semibold text-[#1B2A4A] uppercase tracking-wide">Offer received</span>
                  </div>
                  <p className="text-xl font-bold text-[#1B2A4A] mb-1">$625</p>
                  <p className="text-xs text-[#8A9AB5] mb-3">For: West Elm Mid-Century Modern Sofa</p>
                  {offerStatus === 'pending' ? (
                    <div className="flex gap-2">
                      <button onClick={() => setOfferStatus('accepted')} className="flex-1 py-2 bg-[#2D6A4F] text-white text-xs font-semibold rounded-xl hover:bg-[#1B4332] transition-colors">Accept</button>
                      <button className="flex-1 py-2 border border-[#E8E6DF] text-[#5C6E8A] text-xs font-semibold rounded-xl hover:bg-[#F5F4EF] transition-colors">Counter</button>
                      <button onClick={() => setOfferStatus('declined')} className="flex-1 py-2 border border-[#E8E6DF] text-[#E8694A] text-xs font-semibold rounded-xl hover:bg-[#FDE8E0] transition-colors">Decline</button>
                    </div>
                  ) : (
                    <div className={`text-center py-2 rounded-xl text-xs font-semibold ${offerStatus === 'accepted' ? 'bg-[#D8F3DC] text-[#2D6A4F]' : 'bg-[#FDE8E0] text-[#E8694A]'}`}>
                      {offerStatus === 'accepted' ? '✓ Offer accepted! Schedule a meetup.' : '✗ Offer declined'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scam warning */}
          {showScamWarning && (
            <div className="mx-4 mb-2 p-3 bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-xl animate-fade-in">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[#92400E]">Payment safety reminder</p>
                  <p className="text-xs text-[#78350F] mt-0.5">Never send money via Venmo, Zelle, or gift cards to someone you haven't met. Neighborly never asks for payment outside the app.</p>
                </div>
                <button onClick={() => setShowScamWarning(false)} className="text-[#92400E] hover:opacity-70"><Icon name="x" size={12} /></button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 bg-white border-t border-[#E8E6DF]">
            {/* Quick replies */}
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
              {['Is this still available?', 'Can I see it in person?', 'Would you accept $X?', 'When can I pick up?'].map(r => (
                <button
                  key={r}
                  onClick={() => setNewMessage(r)}
                  className="flex-shrink-0 text-xs px-3 py-1.5 bg-[#F0FBF3] text-[#2D6A4F] border border-[#74C69D]/30 rounded-full font-medium hover:bg-[#D8F3DC] transition-colors whitespace-nowrap"
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <button className="w-9 h-9 flex-shrink-0 rounded-full bg-[#F5F4EF] flex items-center justify-center text-[#8A9AB5] hover:bg-[#EEF0F5] transition-colors">
                <Icon name="camera" size={16} />
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Type a message..."
                  rows={1}
                  className="w-full px-4 py-2.5 bg-[#F5F4EF] rounded-2xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2D6A4F]/10 transition-all min-h-[42px] max-h-28"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="w-9 h-9 flex-shrink-0 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center hover:bg-[#1B4332] transition-colors disabled:opacity-40"
              >
                <Icon name="send" size={14} />
              </button>
            </div>
            <p className="text-[10px] text-[#C5CCDA] text-center mt-2">
              🔒 Messages are secure. Never share personal contact info or pay outside Neighborly.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
