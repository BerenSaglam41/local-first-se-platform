import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

export interface ChatSubmitResult {
  success: boolean;
  summary: string;
}

interface ChatTabProps {
  snapshot: TelemetrySnapshot;
  onSubmitChatGoal: (chatPrompt: string) => Promise<ChatSubmitResult>;
}

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'SYSTEM';
  text: string;
  timestamp: string;
  pending?: boolean;
}

export const ChatTab: React.FC<ChatTabProps> = ({ snapshot, onSubmitChatGoal }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm1', sender: 'SYSTEM', text: 'SE-OS Interactive Chat Session Ready. Type any feature request to evolve project.', timestamp: new Date().toLocaleTimeString() },
  ]);
  const [inputVal, setInputVal] = useState<string>('');

  const handleSend = (val: string) => {
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

    // The message shown once this resolves is the real execution summary — never a scripted
    // "Bob is executing..." line generated before any work actually happened.
    onSubmitChatGoal(text).then((result) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, text: result.summary, pending: false }
            : m
        )
      );
    });
  };

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Text bold color="green" underline>
        INTERACTIVE CHAT-DRIVEN DEVELOPMENT SESSION (Type Request & Press ENTER):
      </Text>

      {/* Chat Messages Log */}
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="cyan" padding={1} height={12}>
        {messages.map((m) => (
          <Box key={m.id} marginY={0}>
            <Text bold color={m.sender === 'USER' ? 'yellow' : m.pending ? 'gray' : 'cyan'}>
              [{m.timestamp}] {m.sender}: {m.text}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Chat Input Prompt Box */}
      <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text bold color="yellow">You &gt; </Text>
        <TextInput value={inputVal} onChange={setInputVal} onSubmit={handleSend} placeholder="e.g. Add JWT Authentication middleware..." />
      </Box>
      <Box marginTop={0}>
        <Text color="gray">* Project continues evolving in the same workspace. Never restarts from scratch.</Text>
      </Box>
    </Box>
  );
};
