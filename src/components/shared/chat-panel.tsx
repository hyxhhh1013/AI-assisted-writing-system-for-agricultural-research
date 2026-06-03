"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Send, Loader2, Sparkles, MessageSquare, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat } from "@/services/chat";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  filename: string;
}

const SUGGESTED_QUESTIONS = [
  "本文的核心研究目标是什么？",
  "采用了哪些实验方法？关键技术路线是什么？",
  "最重要的研究发现有哪些？请详细说明。",
  "本文的创新点和学术贡献是什么？",
  "研究存在哪些局限性？未来可以从哪些方向改进？",
];

export function ChatPanel({ filename }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text?: string) => {
    const question = (text || input).trim();
    if (!question || isStreaming) return;

    const userMsg: Message = { role: "user", content: question };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    // 添加占位的 assistant 消息
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      await streamChat(
        {
          filename,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        },
        (assistantText) => {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, content: assistantText };
            }
            return next;
          });
        },
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? getErrorMessage(error) : "请求失败");
      // 移除占位消息
      setMessages(prev => prev.filter(m => m.content !== ""));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    toast.success("对话已清空");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isFirstMessage = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold">文献对话</span>
          {messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {messages.filter(m => m.role === "user").length} 轮对话
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClear} title="清空对话">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* 消息区域 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        {isFirstMessage ? (
          <div className="flex flex-col items-center justify-center min-h-full p-6 text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-sm font-bold mb-1">AI 文献对话</h3>
            <p className="text-xs text-muted-foreground mb-6 max-w-[280px]">
              我已阅读完整篇文献。你可以就文献内容向我提问，或点击下方问题快速开始。
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[340px]">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  disabled={isStreaming}
                  className="text-left text-xs px-3 py-2 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4 pb-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {msg.role === "assistant" && (
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md",
                  )}
                >
                  {msg.role === "assistant" ? (
                    msg.content ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-xs">思考中...</span>
                      </div>
                    )
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className="border-t p-3 shrink-0 bg-card">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isFirstMessage ? "输入问题开始对话..." : "继续提问..."}
            className="min-h-[44px] max-h-[120px] text-sm resize-none"
            rows={1}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => handleSend()}
            disabled={isStreaming || !input.trim()}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Shift+Enter 换行 · Enter 发送 · AI 基于文献全文回答
        </p>
      </div>
    </div>
  );
}
