import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Message, User } from "@shared/schema";

interface MessageWithUsers extends Message {
  sender?: User;
  receiver?: User;
}

interface Conversation {
  userId: string;
  user?: User;
  lastMessage?: string;
  unreadCount: number;
  bookingId?: string;
}

export default function Messages() {
  const { user } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<MessageWithUsers[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch conversations list
  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
  });

  // Fetch messages for selected conversation
  const { data: conversationMessages } = useQuery<MessageWithUsers[]>({
    queryKey: ["/api/messages", selectedConversation],
    enabled: !!selectedConversation,
  });

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected");
      socket.send(JSON.stringify({ type: "auth", userId: user.id }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        setMessages((prev) => [...prev, data.message]);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
    };

    wsRef.current = socket;

    return () => {
      socket.close();
    };
  }, [user]);

  // Update messages when conversation changes
  useEffect(() => {
    if (conversationMessages) {
      setMessages(conversationMessages);
    }
  }, [conversationMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!messageInput.trim() || !selectedConversation || !wsRef.current) return;

    const messageData = {
      type: "send_message",
      receiverId: selectedConversation,
      content: messageInput.trim(),
    };

    wsRef.current.send(JSON.stringify(messageData));
    setMessageInput("");
  };

  const selectedUser = conversations?.find(
    (c) => c.userId === selectedConversation
  )?.user;

  return (
    <div className="pb-20 md:pb-8">
      <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-8rem)] max-w-7xl mx-auto px-4 md:px-8 py-8">
        <Card className="h-full flex flex-col md:flex-row overflow-hidden">
          {/* Conversations List */}
          <div className={cn(
            "w-full md:w-80 border-b md:border-b-0 md:border-r border-card-border overflow-y-auto",
            selectedConversation && "hidden md:block"
          )}>
            <div className="p-4 border-b border-card-border">
              <h2 className="text-xl font-semibold">Messages</h2>
            </div>

            {!conversations || conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {conversations.map((conv) => (
                  <button
                    key={conv.userId}
                    onClick={() => setSelectedConversation(conv.userId)}
                    className={cn(
                      "w-full p-4 hover-elevate text-left transition-colors",
                      selectedConversation === conv.userId && "bg-muted"
                    )}
                    data-testid={`conversation-${conv.userId}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={conv.user?.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {conv.user?.firstName?.[0] || conv.user?.email?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {conv.user?.firstName && conv.user?.lastName
                            ? `${conv.user.firstName} ${conv.user.lastName}`
                            : conv.user?.email}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage || "No messages"}
                        </div>
                      </div>
                      {conv.unreadCount > 0 && (
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {conv.unreadCount}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chat Area */}
          <div className={cn(
            "flex-1 flex flex-col",
            !selectedConversation && "hidden md:flex"
          )}>
            {!selectedConversation ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Select a conversation to start messaging
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-card-border flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedConversation(null)}
                    className="md:hidden"
                  >
                    ←
                  </Button>
                  {selectedUser && (
                    <>
                      <Avatar>
                        <AvatarImage src={selectedUser.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {selectedUser.firstName?.[0] || selectedUser.email?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">
                          {selectedUser.firstName && selectedUser.lastName
                            ? `${selectedUser.firstName} ${selectedUser.lastName}`
                            : selectedUser.email}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg) => {
                    const isOwnMessage = msg.senderId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          isOwnMessage ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[70%] rounded-2xl px-4 py-2",
                            isOwnMessage
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                          <div
                            className={cn(
                              "text-xs mt-1",
                              isOwnMessage
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            )}
                          >
                            {new Date(msg.createdAt!).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-card-border">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      data-testid="input-message"
                    />
                    <Button
                      size="icon"
                      onClick={sendMessage}
                      disabled={!messageInput.trim()}
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
