import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Send, MessageCircle, Star, ArrowLeft, Paperclip, ChevronDown, ChevronUp, MapPin, Calendar, Weight, X, FileText, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Message, User, MessageAttachment } from "@shared/schema";
import { format } from "date-fns";

interface MessageWithUsers extends Message {
  sender?: User;
  receiver?: User;
  attachments?: MessageAttachment[];
}

interface Conversation {
  userId: string;
  user?: User;
  lastMessage?: string;
  unreadCount: number;
  bookingId?: string;
}

interface TypingUser {
  userId: string;
  timestamp: number;
}

interface OnlineStatus {
  [userId: string]: boolean;
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<MessageWithUsers[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineStatus>({});
  const [isTripDetailsOpen, setIsTripDetailsOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingCleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMessagesRef = useRef<Map<string, boolean>>(new Map());

  // Fetch conversations list
  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
  });

  // Auto-select conversation from URL query parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const userIdParam = searchParams.get('userId');
    
    // Select conversation even if it doesn't exist yet (allows new conversations)
    if (userIdParam) {
      setSelectedConversation(userIdParam);
    } else if (!userIdParam && location === '/messages') {
      setSelectedConversation(null);
    }
  }, [location]);

  // Fetch messages for selected conversation
  const { data: conversationMessages } = useQuery<MessageWithUsers[]>({
    queryKey: ["/api/messages", selectedConversation],
    enabled: !!selectedConversation,
  });

  // Fetch selected user data if not in conversations list (for new conversations)
  const selectedUserFromConv = conversations?.find(
    (c) => c.userId === selectedConversation
  )?.user;

  const { data: fetchedUser } = useQuery<User>({
    queryKey: ["/api/users", selectedConversation],
    enabled: !!selectedConversation && !selectedUserFromConv,
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
      
      // Handle new messages
      if (data.type === "message") {
        setMessages((prev) => {
          // Update message status if it already exists
          const existingIndex = prev.findIndex((m) => m.id === data.message.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...data.message };
            return updated;
          }
          return [...prev, data.message];
        });
      }

      // Handle message sent confirmation
      if (data.type === "message_sent") {
        setMessages((prev) => {
          const updated = [...prev];
          // Find and replace the temporary message using clientMessageId
          const clientMsgId = data.clientMessageId;
          if (clientMsgId && pendingMessagesRef.current.has(clientMsgId)) {
            const tempIndex = updated.findIndex((m) => m.id === clientMsgId);
            if (tempIndex >= 0) {
              // Replace temp message with real message
              updated[tempIndex] = { ...data.message, status: "sent" };
              pendingMessagesRef.current.delete(clientMsgId);
            }
          } else {
            // Fallback: add message if temp not found
            updated.push({ ...data.message, status: "sent" });
          }
          return updated;
        });
      }

      // Handle message delivered confirmation
      if (data.type === "message_delivered") {
        setMessages((prev) => {
          const updated = [...prev];
          const index = updated.findIndex((m) => m.id === data.messageId);
          if (index >= 0) {
            updated[index] = { ...updated[index], status: "delivered" };
          }
          return updated;
        });
      }

      // Handle message read confirmation
      if (data.type === "message_read") {
        setMessages((prev) => {
          const updated = [...prev];
          const index = updated.findIndex((m) => m.id === data.messageId);
          if (index >= 0) {
            updated[index] = { ...updated[index], status: "seen" };
          }
          return updated;
        });
      }

      // Handle typing indicator
      if (data.type === "typing") {
        if (data.isTyping) {
          setTypingUsers((prev) => {
            const filtered = prev.filter((u) => u.userId !== data.userId);
            return [...filtered, { userId: data.userId, timestamp: Date.now() }];
          });
        } else {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        }
      }

      // Handle online status updates
      if (data.type === "user_status") {
        setOnlineUsers((prev) => ({
          ...prev,
          [data.userId]: data.status === "online",
        }));
      }

      // Handle initial online users list
      if (data.type === "online_users") {
        const statusMap: OnlineStatus = {};
        data.users.forEach((userId: string) => {
          statusMap[userId] = true;
        });
        setOnlineUsers(statusMap);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
    };

    wsRef.current = socket;

    // Set up typing cleanup interval (every second, remove entries older than 3 seconds)
    typingCleanupIntervalRef.current = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => now - u.timestamp < 3000));
    }, 1000);

    return () => {
      socket.close();
      if (typingCleanupIntervalRef.current) {
        clearInterval(typingCleanupIntervalRef.current);
      }
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

  // Send typing indicator
  const handleTyping = () => {
    if (!selectedConversation || !wsRef.current) return;

    if (!isTyping) {
      setIsTyping(true);
      wsRef.current.send(
        JSON.stringify({
          type: "typing",
          receiverId: selectedConversation,
          isTyping: true,
        })
      );
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (wsRef.current) {
        wsRef.current.send(
          JSON.stringify({
            type: "typing",
            receiverId: selectedConversation,
            isTyping: false,
          })
        );
      }
    }, 3000);
  };

  const MAX_MESSAGE_LENGTH = 2000;
  const isMessageTooLong = messageInput.length > MAX_MESSAGE_LENGTH;
  const isMessageValid = (messageInput.trim() || attachedFiles.length > 0) && !isMessageTooLong;

  const sendMessage = () => {
    if (!isMessageValid || !selectedConversation || !wsRef.current) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tempMessage: MessageWithUsers = {
      id: tempId,
      senderId: user!.id,
      receiverId: selectedConversation,
      content: messageInput.trim() || "(Fichier joint)",
      status: "sending",
      createdAt: new Date(),
      bookingId: null,
      isRead: false,
      readAt: null,
      deliveredAt: null,
      expiresAt: null,
    };

    // Track pending message for reconciliation
    pendingMessagesRef.current.set(tempId, true);

    // Add temporary message with "sending" status
    setMessages((prev) => [...prev, tempMessage]);

    const messageData = {
      type: "send_message",
      receiverId: selectedConversation,
      content: messageInput.trim() || "(Fichier joint)",
      clientMessageId: tempId,
      attachments: attachedFiles.map(f => ({ url: f.url, name: f.name, type: f.type, size: f.size })),
    };

    wsRef.current.send(JSON.stringify(messageData));
    setMessageInput("");
    setAttachedFiles([]);
    setIsTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  // Remove attached file
  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Handle file input change (native input without modal)
  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;
    
    // Calculate remaining slots
    const remainingSlots = 3 - attachedFiles.length;
    if (remainingSlots <= 0) {
      toast({
        title: "Limite atteinte",
        description: "Vous ne pouvez joindre que 3 fichiers maximum",
        variant: "destructive",
      });
      e.target.value = ""; // Reset input
      return;
    }

    // Validate and filter files
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of files.slice(0, remainingSlots)) {
      if (!allowedTypes.includes(file.type)) {
        errors.push(`"${file.name}" : type non autorisé`);
        continue;
      }
      if (file.size > maxFileSize) {
        errors.push(`"${file.name}" : taille maximale 5 MB dépassée`);
        continue;
      }
      validFiles.push(file);
    }

    if (errors.length > 0) {
      toast({
        title: "Erreur de fichier",
        description: errors.join("\n"),
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) {
      e.target.value = ""; // Reset input
      return;
    }

    // Upload files
    try {
      const uploadPromises = validFiles.map(async (file) => {
        // Get presigned URL
        const urlResponse = await fetch("/api/object-storage/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (!urlResponse.ok) {
          throw new Error(`Échec pour ${file.name}`);
        }

        const { url } = await urlResponse.json();

        // Upload file
        const uploadResponse = await fetch(url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Échec du téléversement de ${file.name}`);
        }

        // Extract public URL (remove query params from presigned URL)
        const publicUrl = url.split("?")[0];

        return {
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          url: publicUrl,
          thumbnailUrl: file.type.startsWith("image/") ? publicUrl : undefined,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      setAttachedFiles((prev) => [...prev, ...uploadedFiles]);

      toast({
        title: "Succès",
        description: `${uploadedFiles.length} fichier(s) joint(s)`,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Erreur de téléversement",
        description: error instanceof Error ? error.message : "Échec du téléversement",
        variant: "destructive",
      });
    } finally {
      e.target.value = ""; // Reset input for next use
    }
  };

  // Send read receipt when messages are viewed
  useEffect(() => {
    if (!selectedConversation || !wsRef.current || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.senderId === selectedConversation && lastMessage.status !== "seen") {
      wsRef.current.send(
        JSON.stringify({
          type: "read_receipt",
          messageId: lastMessage.id,
          originalSenderId: lastMessage.senderId,
        })
      );
    }
  }, [messages, selectedConversation]);

  // Get selected user from conversations or fetch separately for new conversations
  const selectedUser = selectedUserFromConv || fetchedUser;

  const isUserOnline = selectedConversation ? onlineUsers[selectedConversation] : false;
  const isOtherUserTyping = typingUsers.some((t) => t.userId === selectedConversation);

  // Get message status icon
  const getMessageStatusIcon = (status: string | null | undefined) => {
    switch (status) {
      case "sending":
        return <span className="text-xs">●</span>;
      case "sent":
        return <span className="text-xs">✓</span>;
      case "delivered":
        return <span className="text-xs">✓✓</span>;
      case "seen":
        return <span className="text-xs text-primary-foreground">✓✓</span>;
      case "failed":
        return <span className="text-xs text-destructive">!</span>;
      default:
        return null;
    }
  };

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
                      "w-full p-4 hover-elevate text-left transition-colors min-h-[80px]",
                      selectedConversation === conv.userId && "bg-muted"
                    )}
                    data-testid={`conversation-${conv.userId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={conv.user?.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {conv.user?.firstName?.[0] || conv.user?.email?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        {onlineUsers[conv.userId] && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                        )}
                      </div>
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
                        <Badge variant="default" className="min-w-[24px] h-6 rounded-full flex items-center justify-center">
                          {conv.unreadCount}
                        </Badge>
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
                {/* Chat Header - Compact with one-handed operation */}
                <div className="p-3 border-b border-card-border flex items-center gap-3 min-h-[64px]">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedConversation(null)}
                    className="md:hidden min-h-[44px] min-w-[44px]"
                    data-testid="button-back-to-conversations"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  {selectedUser && (
                    <>
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={selectedUser.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {selectedUser.firstName?.[0] || selectedUser.email?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        {isUserOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {selectedUser.firstName && selectedUser.lastName
                            ? `${selectedUser.firstName} ${selectedUser.lastName}`
                            : selectedUser.email}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {selectedUser.rating !== null && selectedUser.rating !== undefined && (
                            <div className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                              <span>{Number(selectedUser.rating).toFixed(1)}</span>
                            </div>
                          )}
                          {isUserOnline ? (
                            <span className="text-green-500">● Online</span>
                          ) : (
                            <span>Offline</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hidden md:flex"
                        data-testid="button-view-trip"
                      >
                        View Trip
                      </Button>
                    </>
                  )}
                </div>

                {/* Trip Details - Collapsible */}
                {selectedUser && (
                  <div className="border-b border-card-border">
                    <button
                      onClick={() => setIsTripDetailsOpen(!isTripDetailsOpen)}
                      className="w-full p-3 flex items-center justify-between hover-elevate min-h-[44px]"
                      data-testid="button-toggle-trip-details"
                    >
                      <span className="text-sm font-medium">Trip Details</span>
                      {isTripDetailsOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    {isTripDetailsOpen && (
                      <div className="p-4 bg-muted/50 space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>Route details will appear here</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Travel dates will appear here</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Weight className="h-4 w-4 text-muted-foreground" />
                          <span>Capacity details will appear here</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                            "max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2",
                            isOwnMessage
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          )}
                        >
                          {msg.content && (
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          )}
                          
                          {/* Message attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={cn("space-y-2", msg.content && "mt-2")}>
                              {msg.attachments.map((attachment: any) => {
                                const fileType = attachment.fileType || attachment.type;
                                const fileName = attachment.fileName || attachment.name;
                                const fileSize = attachment.fileSize || attachment.size;
                                const isImage = fileType?.startsWith("image/");
                                return (
                                  <div
                                    key={attachment.id}
                                    className={cn(
                                      "rounded-md overflow-hidden",
                                      isImage && "max-w-[250px]"
                                    )}
                                    data-testid={`attachment-${attachment.id}`}
                                  >
                                    {isImage ? (
                                      <a
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block hover:opacity-90 transition-opacity"
                                        data-testid={`link-image-${attachment.id}`}
                                      >
                                        <img
                                          src={attachment.thumbnailUrl || attachment.url}
                                          alt={fileName}
                                          className="w-full h-auto rounded-md"
                                        />
                                      </a>
                                    ) : (
                                      <a
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={fileName}
                                        className={cn(
                                          "flex items-center gap-2 p-2 rounded-md border hover:opacity-80 transition-opacity",
                                          isOwnMessage
                                            ? "border-primary-foreground/20 bg-primary-foreground/10"
                                            : "border-card-border bg-card"
                                        )}
                                        data-testid={`link-document-${attachment.id}`}
                                      >
                                        <FileText className="h-5 w-5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium truncate">
                                            {fileName}
                                          </p>
                                          <p className={cn(
                                            "text-xs",
                                            isOwnMessage
                                              ? "text-primary-foreground/70"
                                              : "text-muted-foreground"
                                          )}>
                                            {((fileSize || 0) / 1024).toFixed(1)} KB
                                          </p>
                                        </div>
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          
                          <div
                            className={cn(
                              "text-xs mt-1 flex items-center gap-1 justify-end",
                              isOwnMessage
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            )}
                          >
                            <span>
                              {msg.createdAt && format(new Date(msg.createdAt), "HH:mm")}
                            </span>
                            {isOwnMessage && getMessageStatusIcon(msg.status)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Typing indicator */}
                  {isOtherUserTyping && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-4 py-2 rounded-bl-sm">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input - Sticky compose bar with 44px+ tap targets */}
                <div className="border-t border-card-border bg-background sticky bottom-0">
                  {/* Attached files preview */}
                  {attachedFiles.length > 0 && (
                    <div className="p-3 border-b border-card-border">
                      <div className="flex flex-wrap gap-2">
                        {attachedFiles.map((file) => (
                          <div
                            key={file.id}
                            className="relative group rounded-md border border-card-border p-2 flex items-center gap-2 bg-card max-w-full"
                            data-testid={`preview-file-${file.id}`}
                          >
                            {file.type.startsWith("image/") ? (
                              <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate max-w-[140px]">
                                {file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => removeAttachedFile(file.id)}
                              aria-label={`Retirer ${file.name}`}
                              data-testid={`button-remove-file-${file.id}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Compose bar */}
                  <div className="p-3">
                    <div className="flex gap-2 items-end">
                      {/* Hidden file input - Never gets focus automatically */}
                      <input
                        type="file"
                        id="file-input-hidden"
                        multiple
                        accept=".jpg,.jpeg,.png,.pdf"
                        className="hidden"
                        onChange={handleFileInputChange}
                        data-testid="input-file-hidden"
                      />
                      
                      {/* Attach file button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] shrink-0"
                        disabled={attachedFiles.length >= 3}
                        onClick={() => document.getElementById('file-input-hidden')?.click()}
                        aria-label="Joindre un fichier"
                        data-testid="button-attach-file"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                      
                      {/* Message input */}
                      <div className="flex-1">
                        <div className="relative">
                          <Textarea
                            placeholder="Écrivez un message..."
                            value={messageInput}
                            onChange={(e) => {
                              setMessageInput(e.target.value);
                              handleTyping();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                              }
                            }}
                            className={cn(
                              "min-h-[44px] max-h-[120px] resize-none text-base",
                              isMessageTooLong && "border-destructive focus-visible:ring-destructive"
                            )}
                            rows={1}
                            data-testid="input-message"
                          />
                          <div className={cn(
                            "absolute bottom-2 right-2 text-xs pointer-events-none",
                            isMessageTooLong ? "text-destructive font-semibold" : "text-muted-foreground"
                          )}>
                            {messageInput.length}/{MAX_MESSAGE_LENGTH}
                          </div>
                        </div>
                        {isMessageTooLong && (
                          <p className="text-xs text-destructive mt-1" role="alert" data-testid="text-error-message-too-long">
                            Votre message est trop long. Maximum {MAX_MESSAGE_LENGTH} caractères.
                          </p>
                        )}
                      </div>
                      
                      {/* Send button */}
                      <Button
                        type="button"
                        size="icon"
                        onClick={sendMessage}
                        disabled={!isMessageValid}
                        className="min-h-[44px] min-w-[44px] shrink-0"
                        aria-label="Envoyer le message"
                        data-testid="button-send-message"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
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
