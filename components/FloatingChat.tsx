'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, type Message, type Connection } from '@/lib/supabase';

type FloatingChatProps = {
  connections: Connection[];
  currentUserId: string;
  onConnectionUpdate?: () => void;
};

type ChatSession = {
  connection: Connection;
  messages: Message[];
  unreadCount: number;
  isLoading: boolean;
  newMessage: string;
  isTyping: boolean;
  otherUserTyping: boolean;
};

export default function FloatingChat({ connections, currentUserId, onConnectionUpdate }: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({});
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<Record<string, any>>({});
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Initialize chat sessions for all connections
  useEffect(() => {
    const initSessions: Record<string, ChatSession> = {};
    connections.forEach(conn => {
      if (!chatSessions[conn.id]) {
        initSessions[conn.id] = {
          connection: conn,
          messages: [],
          unreadCount: conn.unread_count || 0,
          isLoading: false,
          newMessage: '',
          isTyping: false,
          otherUserTyping: false,
        };
      }
    });
    
    if (Object.keys(initSessions).length > 0) {
      setChatSessions(prev => ({ ...prev, ...initSessions }));
    }
  }, [connections]);

  // Calculate total unread count
  useEffect(() => {
    const total = Object.values(chatSessions).reduce((sum, session) => sum + session.unreadCount, 0);
    setTotalUnreadCount(total);
  }, [chatSessions]);

  // Load messages for active chat and scroll to bottom
  useEffect(() => {
    if (activeChat && !chatSessions[activeChat]?.messages.length) {
      fetchMessages(activeChat);
      subscribeToMessages(activeChat);
    }
    
    // Scroll to bottom when switching chats
    if (activeChat) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [activeChat]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeChat && chatSessions[activeChat]?.messages.length > 0) {
      setTimeout(() => scrollToBottom(), 50);
    }
  }, [activeChat, chatSessions[activeChat]?.messages]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      Object.values(channelsRef.current).forEach(channel => {
        supabase.removeChannel(channel);
      });
      Object.values(typingTimeoutsRef.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, []);

  const fetchMessages = async (connectionId: string) => {
    try {
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], isLoading: true }
      }));

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { 
          ...prev[connectionId], 
          messages: data || [],
          isLoading: false
        }
      }));

      // Mark messages as read
      await markMessagesAsRead(connectionId);
      
    } catch (error) {
      console.error('Error fetching messages:', error);
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], isLoading: false }
      }));
    }
  };

  const subscribeToMessages = (connectionId: string) => {
    // Clean up existing subscription
    if (channelsRef.current[connectionId]) {
      supabase.removeChannel(channelsRef.current[connectionId]);
    }

    const channel = supabase
      .channel(`floating-chat-${connectionId}-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=eq.${connectionId}`
        },
        (payload) => {
          const newMsg = payload.new as Message;
          
          setChatSessions(prev => ({
            ...prev,
            [connectionId]: {
              ...prev[connectionId],
              messages: [...(prev[connectionId]?.messages || []).filter(m => !m.id.startsWith('temp-')), newMsg],
              unreadCount: newMsg.sender_id !== currentUserId 
                ? (prev[connectionId]?.unreadCount || 0) + 1
                : prev[connectionId]?.unreadCount || 0
            }
          }));

          // Auto-scroll if chat is active and scroll to bottom
          if (activeChat === connectionId) {
            setTimeout(scrollToBottom, 100);
            if (newMsg.sender_id !== currentUserId) {
              markMessagesAsRead(connectionId);
            }
          }

          // Show notification if chat is closed or not active
          if (!isOpen || activeChat !== connectionId) {
            if (newMsg.sender_id !== currentUserId) {
              showNotification(newMsg, connections.find(c => c.id === connectionId));
            }
          }
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.user_id !== currentUserId) {
          setChatSessions(prev => ({
            ...prev,
            [connectionId]: {
              ...prev[connectionId],
              otherUserTyping: payload.payload.typing
            }
          }));

          if (payload.payload.typing) {
            setTimeout(() => {
              setChatSessions(prev => ({
                ...prev,
                [connectionId]: {
                  ...prev[connectionId],
                  otherUserTyping: false
                }
              }));
            }, 3000);
          }
        }
      })
      .subscribe();

    channelsRef.current[connectionId] = channel;
  };

  const markMessagesAsRead = async (connectionId: string) => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('connection_id', connectionId)
        .eq('is_read', false)
        .neq('sender_id', currentUserId);

      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], unreadCount: 0 }
      }));

      onConnectionUpdate?.();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async (connectionId: string) => {
    const session = chatSessions[connectionId];
    if (!session?.newMessage.trim() || session.isLoading) return;

    const messageContent = session.newMessage.trim();
    
    // Create optimistic message for immediate UI feedback
    const tempMessage = {
      id: `temp-${Date.now()}`,
      content: messageContent,
      sender_id: currentUserId,
      connection_id: connectionId,
      is_read: false,
      created_at: new Date().toISOString()
    };

    // Clear input and add optimistic message immediately
    setChatSessions(prev => ({
      ...prev,
      [connectionId]: {
        ...prev[connectionId],
        newMessage: '',
        messages: [...(prev[connectionId]?.messages || []), tempMessage],
        isLoading: true,
        isTyping: false
      }
    }));

    // Send typing indicator stop
    sendTypingIndicator(connectionId, false);

    // Scroll to bottom immediately
    setTimeout(() => scrollToBottom(), 50);

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          connection_id: connectionId,
          sender_id: currentUserId,
          content: messageContent
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temp message with real message
      if (data) {
        setChatSessions(prev => ({
          ...prev,
          [connectionId]: {
            ...prev[connectionId],
            messages: prev[connectionId].messages.map(msg => 
              msg.id === tempMessage.id ? data : msg
            )
          }
        }));
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove failed message and restore input
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: {
          ...prev[connectionId],
          messages: prev[connectionId].messages.filter(msg => msg.id !== tempMessage.id),
          newMessage: messageContent
        }
      }));
    } finally {
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], isLoading: false }
      }));
    }
  };

  const sendTypingIndicator = (connectionId: string, typing: boolean) => {
    const channel = channelsRef.current[connectionId];
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: currentUserId,
          typing: typing
        }
      });
    }
  };

  const handleInputChange = (connectionId: string, value: string) => {
    const session = chatSessions[connectionId];
    
    setChatSessions(prev => ({
      ...prev,
      [connectionId]: { ...prev[connectionId], newMessage: value }
    }));

    // Handle typing indicators
    if (value.trim() && !session.isTyping) {
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], isTyping: true }
      }));
      sendTypingIndicator(connectionId, true);
    } else if (!value.trim() && session.isTyping) {
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], isTyping: false }
      }));
      sendTypingIndicator(connectionId, false);
    }

    // Clear and set new typing timeout
    if (typingTimeoutsRef.current[connectionId]) {
      clearTimeout(typingTimeoutsRef.current[connectionId]);
    }

    typingTimeoutsRef.current[connectionId] = setTimeout(() => {
      setChatSessions(prev => ({
        ...prev,
        [connectionId]: { ...prev[connectionId], isTyping: false }
      }));
      sendTypingIndicator(connectionId, false);
    }, 2000);
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  };

  const showNotification = (message: Message, connection?: Connection) => {
    if (Notification.permission === 'granted' && connection) {
      new Notification(`New message from ${connection.profile.full_name}`, {
        body: message.content,
        icon: connection.profile.avatar_url || '/favicon.ico',
        tag: `chat-${connection.id}`,
      });
    }
    
    // Play notification sound
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IAAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmoeGTWB0/HYijcHGGS57OyiRAoWTKHi8blnGgU+l9n1unAjBSV+yO/ajDoYE1yn6OWsUAcbVKzj9LNhGwY8jtn1t2gcASttuOjpsU8ITK9u+IhSTw+rsvG9ZRkGPYzY8tV6IQUpccPu3JA9CBGCr+/rn00HDFQY0u+vUQoSXbLs2WUDMIjB0vD7lVkSVK/gvWNaHz6CycbvpDkUSFOktpP8jUQNO5DRGEqXKjKNwfO9N0ywAKZN8EWFQP1ETQKdLCBBhYZFr19Ykl2LsXf3m3E+vplKkM5OBCKYKCJvzLgJV7eQb2uftfH+kz8Aq4hwKCZVrE3wjA3cP0UiL3wEI2tI73jGPrKoVZlY4nM2s1qOkMQa0VGpKK3c/ViYJD1fAFElXK1oUNSWR6E7F72a8Y1DKDB+FzSW3J5fvhFxOgx3YBJfAENGfE7EwwT18K9hKkSCN5zaTWYrZ0sD6cJBKkfXX'); // Simple notification sound
      audio.play().catch(() => {}); // Ignore errors if sound can't play
    } catch (e) {
      // Ignore sound errors
    }
  };

  const openChat = (connectionId: string) => {
    setActiveChat(connectionId);
    setIsOpen(true);
    if (chatSessions[connectionId]?.unreadCount > 0) {
      markMessagesAsRead(connectionId);
    }
  };

  const closeChat = () => {
    setIsOpen(false);
    setActiveChat(null);
    setShowEmojiPicker(false);
  };

  // Request notification permission and setup click outside handler for emoji picker
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

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

  if (connections.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 z-[1000] w-16 h-16 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 ${
            totalUnreadCount > 0 ? 'animate-bounce' : ''
          }`}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          
          {/* Unread Messages Badge */}
          {totalUnreadCount > 0 && (
            <>
              <div className="absolute -top-2 -right-2 bg-[#ED3500] text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1 animate-pulse">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </div>
              {/* Pulsing ring effect */}
              <div className="absolute inset-0 rounded-full bg-[#ED3500] animate-ping opacity-20"></div>
            </>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[1000] w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-200 animate-in slide-in-from-bottom-4 duration-300">
          {!activeChat ? (
            // Connections List
            <>
              <div className="bg-gradient-to-r from-[#093FB4] to-[#0652e8] text-white p-4 rounded-t-2xl flex items-center justify-between">
                <h3 className="font-bold text-lg">Messages</h3>
                <button
                  onClick={closeChat}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {connections.map((connection) => {
                  const session = chatSessions[connection.id];
                  const lastMessage = session?.messages[session.messages.length - 1];
                  
                  return (
                    <div
                      key={connection.id}
                      onClick={() => openChat(connection.id)}
                      className="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {connection.profile.avatar_url ? (
                          <img
                            src={connection.profile.avatar_url}
                            alt={connection.profile.full_name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-[#093FB4]"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-full flex items-center justify-center text-white font-bold ${connection.profile.avatar_url ? 'hidden' : ''}`}>
                          {connection.profile.full_name.charAt(0).toUpperCase()}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-800 truncate">
                              {connection.profile.full_name}
                            </h4>
                            {lastMessage && (
                              <span className="text-xs text-gray-500">
                                {new Date(lastMessage.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-600 truncate">
                              {lastMessage ? (
                                <span>
                                  {lastMessage.sender_id === currentUserId ? 'You: ' : ''}
                                  {lastMessage.content}
                                </span>
                              ) : (
                                <span className="italic">No messages yet</span>
                              )}
                            </p>
                            
                            {session?.unreadCount > 0 && (
                              <span className="bg-[#ED3500] text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1 ml-2">
                                {session.unreadCount > 99 ? '99+' : session.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            // Individual Chat
            <>
              {/* Chat Header */}
              <div className="bg-gradient-to-r from-[#093FB4] to-[#0652e8] text-white p-4 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveChat(null)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {chatSessions[activeChat]?.connection.profile.avatar_url ? (
                    <img
                      src={chatSessions[activeChat].connection.profile.avatar_url}
                      alt={chatSessions[activeChat].connection.profile.full_name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold ${chatSessions[activeChat]?.connection.profile.avatar_url ? 'hidden' : ''}`}>
                    {chatSessions[activeChat]?.connection.profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  
                  <div>
                    <h3 className="font-bold">{chatSessions[activeChat]?.connection.profile.full_name}</h3>
                    <p className="text-xs opacity-80">
                      {chatSessions[activeChat]?.otherUserTyping ? 'typing...' : 'online'}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={closeChat}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {chatSessions[activeChat]?.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-8 h-8 border-4 border-[#093FB4] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : chatSessions[activeChat]?.messages.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-8">
                    No messages yet. Start the conversation! 👋
                  </div>
                ) : (
                  chatSessions[activeChat]?.messages.map((message) => {
                    const isOwnMessage = message.sender_id === currentUserId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 group ${
                            isOwnMessage
                              ? 'bg-gradient-to-r from-[#093FB4] to-[#0652e8] text-white'
                              : 'bg-white text-gray-800 border border-gray-200'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <p
                              className={`text-xs ${
                                isOwnMessage ? 'text-white/70' : 'text-gray-500'
                              }`}
                            >
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            {isOwnMessage && (
                              <div className="flex">
                                {/* Message status - for now just show sent indicator */}
                                <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                </svg>
                                {/* Double checkmark for read messages (you can implement read receipts later) */}
                                {message.is_read && (
                                  <svg className="w-3 h-3 text-white/70 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                  </svg>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing Indicator */}
                {chatSessions[activeChat]?.otherUserTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white text-gray-800 border border-gray-200 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                          {chatSessions[activeChat]?.connection.profile.full_name} is typing
                        </span>
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-[#093FB4] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 bg-[#093FB4] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 bg-[#093FB4] rounded-full animate-bounce"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl relative">
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div 
                    ref={emojiPickerRef}
                    className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-10"
                  >
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
                    <div className="grid grid-cols-8 gap-2 max-h-32 overflow-y-auto">
                      {['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '👍', '👎', '👌', '🤞', '✌️', '🤟', '🤘', '👊', '✊', '🤛', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '🤎', '💔', '🔥', '💯', '💫', '⭐', '🌟', '✨', '💥', '🎉', '🎊', '🎈'].map((emoji, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            const newValue = (chatSessions[activeChat]?.newMessage || '') + emoji;
                            handleInputChange(activeChat, newValue);
                            setShowEmojiPicker(false);
                          }}
                          className="text-lg hover:bg-gray-100 rounded-lg p-1 transition-colors"
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
                    <span className="text-lg">😀</span>
                  </button>
                  <input
                    type="text"
                    value={chatSessions[activeChat]?.newMessage || ''}
                    onChange={(e) => handleInputChange(activeChat, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (chatSessions[activeChat]?.newMessage.trim()) {
                          sendMessage(activeChat);
                        }
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none text-sm"
                    disabled={chatSessions[activeChat]?.isLoading}
                  />
                  <button
                    onClick={() => sendMessage(activeChat)}
                    disabled={chatSessions[activeChat]?.isLoading || !chatSessions[activeChat]?.newMessage.trim()}
                    className="px-4 py-2 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {chatSessions[activeChat]?.isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}