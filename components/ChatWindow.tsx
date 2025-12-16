import React, { useState, useEffect, useRef } from 'react';
import { Send, Shield, ShieldAlert, Lock, MoreVertical, ArrowLeft, ThumbsUp, Sparkles, Check, XCircle, CheckCircle, Users, LogOut } from 'lucide-react';
import { Message, User, Conversation } from '../types';
import { messagingService } from '../services/messagingService';
import { intuitionService } from '../services/intuitionService';

interface ChatWindowProps {
  conversation: Conversation;
  currentUser: User;
  onBack?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation: initialConvo, currentUser, onBack }) => {
  const [conversation, setConversation] = useState(initialConvo);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [partner, setPartner] = useState<User | null>(null);
  const [isVouching, setIsVouching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark as read when opening conversation
  useEffect(() => {
    messagingService.markAsRead(initialConvo.id);
  }, [initialConvo.id]);

  useEffect(() => {
    setConversation(initialConvo);
    const loadData = async () => {
      const partnerId = initialConvo.participants.find(p => p !== 'me');
      if (partnerId) {
        // Try getting community if standard user fetch fails or if group
        let user;
        if (initialConvo.isGroup) {
             const comms = await intuitionService.getCommunities();
             user = comms.find(c => c.id === partnerId);
             if(!user) user = await intuitionService.getUser(partnerId); // Fallback
        } else {
             user = await intuitionService.getUser(partnerId);
        }
        setPartner(user);
      }
      const msgs = await messagingService.getMessages(initialConvo.id);
      setMessages(msgs);
    };
    loadData();

    const unsubscribe = messagingService.onMessage((msg) => {
        // If message belongs to this chat
        if (msg.senderId === 'me' || initialConvo.participants.includes(msg.senderId)) {
             setMessages(prev => [...prev, msg]);
             // Mark as read immediately if window is open
             if (msg.senderId !== 'me') {
                 messagingService.markAsRead(initialConvo.id);
             }
        }
    });
    return () => { unsubscribe(); };
  }, [initialConvo]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !partner) return;
    await messagingService.sendMessage(partner.id, inputText);
    setInputText('');
  };

  const handleVouch = async () => {
      if (!partner || isVouching || conversation.isGroup) return;
      setIsVouching(true);
      try {
          await intuitionService.attestToUser(partner.id);
          const updatedUser = await intuitionService.getUser(partner.id);
          if (updatedUser) setPartner(updatedUser);
          
          const vouchMsg: Message = {
            id: `sys_${Date.now()}`,
            senderId: 'me',
            receiverId: partner.id,
            content: messagingService.encrypt(`You vouched for ${partner.name}. Trust Score increased.`),
            timestamp: Date.now(),
            read: true,
            type: 'system'
          };
          setMessages(prev => [...prev, vouchMsg]);
      } catch (e) {
          console.error("Vouch failed", e);
      } finally {
          setIsVouching(false);
      }
  };

  const handleAccept = async () => {
      const updated = await messagingService.acceptRequest(conversation.id);
      if (updated) setConversation(updated);
  };

  const handleSlash = async () => {
      const updated = await messagingService.rejectRequest(conversation.id);
      if (updated) setConversation(updated);
      if (onBack) onBack();
  };

  const handleLeaveGroup = async () => {
      if (window.confirm("Are you sure you want to leave this community?")) {
          await messagingService.leaveConversation(conversation.id);
          if (onBack) onBack();
      }
  };

  const getTrustColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (!partner) return <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs animate-pulse">ESTABLISHING CONNECTION...</div>;

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none z-0"></div>

      {/* Header */}
      <div className="h-20 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-black/20 backdrop-blur-md sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="relative group cursor-pointer">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full opacity-75 group-hover:opacity-100 blur transition duration-200"></div>
            <img src={partner.avatar} alt={partner.name} className={`relative w-11 h-11 rounded-full bg-slate-900 object-cover border border-black ${conversation.isGroup ? 'rounded-xl' : ''}`} />
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="font-bold text-slate-100 flex items-center gap-2 text-lg font-display tracking-tight">
              {partner.name}
              {conversation.isGroup ? 
                <Users size={16} className="text-slate-400" /> : 
                <Shield size={16} className={getTrustColor(partner.trustScore)} fill="currentColor" fillOpacity={0.2} />
              }
            </h2>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[150px] md:max-w-xs">
              {partner.reputationAtoms && partner.reputationAtoms.length > 0 ? (
                partner.reputationAtoms.slice(0, 3).map((tag, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-indigo-200 whitespace-nowrap border border-white/5">{tag}</span>
                ))
              ) : <span className="text-[10px] text-slate-500 font-mono">No reputation tags</span>}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {!conversation.isGroup ? (
            <button onClick={handleVouch} disabled={isVouching || partner.trustScore >= 99} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isVouching ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20 hover:text-white'}`}>
                {isVouching ? <Sparkles size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                <span className="hidden md:inline">{isVouching ? 'SIGNING...' : 'VOUCH'}</span>
            </button>
            ) : (
             <button onClick={handleLeaveGroup} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
                <LogOut size={14} />
                <span className="hidden md:inline">LEAVE</span>
             </button>
            )}
            <button className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"><MoreVertical size={20} /></button>
        </div>
      </div>

      {/* Messages / Request UI */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 z-10" ref={scrollRef}>
        
        {conversation.status === 'request_pending' && (
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/60 border border-indigo-500/30 rounded-xl p-6 backdrop-blur-md shadow-[0_0_50px_rgba(99,102,241,0.15)] max-w-2xl mx-auto mt-8">
            <div className="flex items-start gap-5">
              <div className="p-4 bg-indigo-500/20 rounded-full shrink-0 border border-indigo-500/20 shadow-inner">
                <ShieldAlert className="text-indigo-400" size={32} />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white font-display mb-2">Message Request: Trust Gated</h4>
                <p className="text-slate-300 leading-relaxed mb-4">
                  The sender <strong className="text-white">{partner.name}</strong> has a Trust Score of <span className="text-red-400 font-bold">{partner.trustScore}</span>, which is below your threshold.
                </p>
                
                <div className="bg-black/30 rounded-lg p-3 mb-6 flex items-center gap-3 border border-white/5">
                   <Lock size={18} className="text-amber-400" />
                   <span className="text-sm text-amber-200">Collateral Bond Locked: <strong>{conversation.collateralLocked} ETH</strong></span>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleAccept} className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/50 flex items-center justify-center gap-2">
                    <CheckCircle size={18} /> ACCEPT & BOND
                  </button>
                  <button onClick={handleSlash} className="flex-1 px-4 py-3 bg-red-900/40 hover:bg-red-900/60 text-red-200 rounded-xl font-bold transition-all border border-red-500/20 hover:border-red-500/50 flex items-center justify-center gap-2">
                    <XCircle size={18} /> SLASH & BLOCK
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 text-center">Accepting releases the bond back to the sender. Slashing burns the bond.</p>
              </div>
            </div>
          </div>
        )}

        {conversation.status !== 'request_pending' && messages.map((msg, idx) => {
          if (msg.type === 'system') return (
              <div key={msg.id} className="flex justify-center my-4 animate-fade-in"><div className="bg-slate-800/50 border border-slate-700/50 rounded-full px-4 py-1.5 flex items-center gap-2"><Check size={12} className="text-emerald-400" /><span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">{messagingService.decrypt(msg.content)}</span></div></div>
          );
          const isMe = msg.senderId === 'me';
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] md:max-w-[70%] px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm backdrop-blur-sm border ${isMe ? 'bg-indigo-600/80 text-white rounded-br-none border-indigo-400/30' : 'bg-slate-800/60 text-slate-200 rounded-bl-none border-white/10'}`}>
                {messagingService.decrypt(msg.content)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input - Disabled if Request Pending */}
      <div className="p-4 bg-black/20 backdrop-blur-md border-t border-white/5 z-20">
        <div className="flex items-center gap-2 bg-white/5 p-2 rounded-2xl border border-white/10 focus-within:border-indigo-500/50 focus-within:bg-white/10 transition-all shadow-lg">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={conversation.status === 'request_pending' ? "Action required to reply..." : "Type an encrypted message..."}
            disabled={conversation.status === 'request_pending'}
            className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-500 px-4 text-sm md:text-base font-medium disabled:opacity-50"
          />
          <button onClick={handleSend} disabled={!inputText.trim() || conversation.status === 'request_pending'} className="p-3 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_10px_rgba(99,102,241,0.4)] hover:scale-105 active:scale-95">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}