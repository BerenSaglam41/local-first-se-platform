import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';
import { Kernel } from '../../../../kernel/kernel';

export interface ChatSubmitResult {
  success: boolean;
  summary: string;
}

interface ChatTabProps {
  snapshot: TelemetrySnapshot;
  onSubmitChatGoal: (chatPrompt: string) => Promise<ChatSubmitResult>;
  kernel?: Kernel;
}

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'SYSTEM';
  text: string;
  timestamp: string;
  pending?: boolean;
}

export const ChatTab: React.FC<ChatTabProps> = ({ snapshot, onSubmitChatGoal, kernel }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm1', sender: 'SYSTEM', text: 'SE-OS Interactive Chat Session Ready. Type any feature request to evolve project.', timestamp: new Date().toLocaleTimeString() },
  ]);
  const [inputVal, setInputVal] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const teamMessages = kernel
    ? kernel.getWorkerStore().list().flatMap((worker) => kernel.getCollaborationEngine().getInbox(worker.id).map((message) => ({ ...message, recipientName: worker.name }))).slice(-8)
    : [];

  const handleSend = (val: string) => {
    if (submitting) return;
    const text = val.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: 'USER',
      text,
      timestamp: new Date().toLocaleTimeString(),
    };
    const pendingId = `m-${Date.now() + 1}`;
    const pendingMsg: ChatMessage = {
      id: pendingId,
      sender: 'SYSTEM',
      text: 'Dispatched to workers, running...',
      timestamp: new Date().toLocaleTimeString(),
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInputVal('');
    setSubmitting(true);

    // The message shown once this resolves is the real execution summary — never a scripted
    // "Bob is executing..." line generated before any work actually happened.
    onSubmitChatGoal(text)
      .then((result) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? { ...m, text: result.summary, pending: false }
              : m
          )
        );
      })
      .catch((error: any) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? { ...m, text: `Chat execution error: ${error?.message || 'Unknown error'}`, pending: false }
              : m
          )
        );
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Text bold color="green">
        COMMAND CENTER  /  Tell the team what to build or change
      </Text>
      <Text color="gray">You are the owner. SE-OS plans the work, assigns the right engineer, and reports the result here.</Text>

      {/* Chat Messages Log */}
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="cyan" padding={1} height={12}>
        {messages.slice(-8).map((m) => (
          <Box key={m.id} marginY={0}>
            <Text bold color={m.sender === 'USER' ? 'yellow' : m.pending ? 'gray' : 'cyan'}>
              [{m.timestamp}] {m.sender}: {m.text}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="magenta" padding={1}>
        <Text bold color="magenta">TEAM MAILBOX  /  Questions, answers, reviews</Text>
        {teamMessages.length === 0 ? (
          <Text color="gray">No worker messages yet. They will appear here when the team coordinates.</Text>
        ) : teamMessages.map((message) => (
          <Text key={message.id} color={message.messageType === 'QUESTION' ? 'yellow' : message.messageType === 'ANSWER' ? 'green' : 'gray'}>
            [{message.messageType}] {message.senderId} → {message.recipientName}: {message.summary}
          </Text>
        ))}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text bold color="yellow">YOU  &gt; </Text>
        <TextInput value={inputVal} onChange={setInputVal} onSubmit={handleSend} placeholder={submitting ? 'Current project is running...' : 'e.g. Add JWT Authentication middleware...'} />
      </Box>
      <Box marginTop={0}>
        <Text color="gray">Enter = send goal  ·  1 = overview  ·  2 = team  ·  4 = terminals  ·  6 = checks  {submitting ? '·  The team is working…' : ''}</Text>
      </Box>
    </Box>
  );
};
