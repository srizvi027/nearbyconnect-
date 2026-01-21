'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, type Message, type Connection } from '@/lib/supabase';

type ChatWindowProps = {
  connection: Connection;
  currentUserId: string;
  onClose: () => void;
};

export default function ChatWindow({ connection, currentUserId, onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    const cleanup = subscribeToMessages();
    markMessagesAsRead();
    
    return cleanup;
  }, [connection.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error: unknown) {
      console.error('Error fetching messages:', error);
    }
  };

  const subscribeToMessages = () => {
    console.log('🔔 Setting up real-time subscription for connection:', connection.id);
    
    // Clean up previous subscription if it exists
    if (channelRef.current) {
      console.log('🧹 Cleaning up previous subscription');
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`messages-${connection.id}-${Date.now()}`) // Unique channel name
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=eq.${connection.id}`
        },
        (payload) => {
          console.log('💬 New message received:', payload);
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Remove any temporary messages with the same content and sender
            const filteredPrev = prev.filter(msg => 
              !(msg.id.startsWith('temp-') && 
                msg.content === newMsg.content && 
                msg.sender_id === newMsg.sender_id)
            );
            
            // Avoid duplicates with real messages
            if (filteredPrev.find(msg => msg.id === newMsg.id)) {
              return filteredPrev;
            }
            
            return [...filteredPrev, newMsg];
          });
          
          if (newMsg.sender_id !== currentUserId) {
            markMessagesAsRead();
          }
          
          // Auto-scroll to bottom
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    channelRef.current = channel;
    console.log('✅ Real-time subscription established for connection:', connection.id);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  };

  const markMessagesAsRead = async () => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('connection_id', connection.id)
        .eq('is_read', false)
        .neq('sender_id', currentUserId);
    } catch (error: unknown) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || loading) return;

    const messageContent = newMessage.trim();
    console.log('📤 Sending message:', messageContent);
    setNewMessage('');
    setLoading(true);

    try {
      // Create the message object for immediate UI update
      const tempMessage = {
        id: `temp-${Date.now()}`, // Temporary ID
        content: messageContent,
        sender_id: currentUserId,
        connection_id: connection.id,
        is_read: false,
        created_at: new Date().toISOString()
      };

      // Add message to local state immediately for better UX
      setMessages(prev => [...prev, tempMessage]);

      // Send to database
      const { data, error } = await supabase
        .from('messages')
        .insert({
          connection_id: connection.id,
          sender_id: currentUserId,
          content: messageContent
        })
        .select()
        .single();

      if (error) {
        // Remove the temporary message on error
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
        setNewMessage(messageContent); // Restore message content
        throw error;
      }

      // Replace temporary message with real one if received
      if (data) {
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id ? data : msg
        ));
      }

      // Clear the input
      setNewMessage('');
        throw error;
      } else {
        // Replace temporary message with real message from database
        setMessages(prev => 
          prev.map(msg => 
            msg.id === tempMessage.id ? data : msg
          )
        );
      }
    } catch (error: unknown) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const popularEmojis = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗',
    '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮',
    '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝', '🤤',
    '👍', '👎', '👌', '🤞', '✌️', '🤟', '🤘', '👊', '✊', '🤛',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '🤎', '💔',
    '🔥', '💯', '💫', '⭐', '🌟', '✨', '💥', '🎉', '🎊', '🎈'
  ];

  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col z-[2000] border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#093FB4] to-[#0652e8] text-white p-4 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          {connection.profile.avatar_url ? (
            <img
              src={connection.profile.avatar_url}
              alt={connection.profile.full_name}
              className="w-10 h-10 rounded-full object-cover border-2 border-white"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold ${connection.profile.avatar_url ? 'hidden' : ''}`}>
            {connection.profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold">{connection.profile.full_name}</h3>
            <p className="text-xs opacity-80">@{connection.profile.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.sender_id === currentUserId;
            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    isOwnMessage
                      ? 'bg-gradient-to-r from-[#093FB4] to-[#0652e8] text-white'
                      : 'bg-white text-gray-800 border border-gray-200'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isOwnMessage ? 'text-white/70' : 'text-gray-500'
                    }`}
                  >
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl relative">
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div ref={emojiPickerRef} className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-10">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-gray-700">Choose an emoji</h3>
              <button
                onClick={() => setShowEmojiPicker(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-10 gap-2 max-h-48 overflow-y-auto">
              {popularEmojis.map((emoji, index) => (
                <button
                  key={index}
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl hover:bg-gray-100 rounded-lg p-1 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 text-gray-500 hover:text-[#093FB4] rounded-xl transition-colors"
            type="button"
          >
            <span className="text-xl">😀</span>
          </button>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none resize-none"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !newMessage.trim()}
            className="px-4 py-2 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}