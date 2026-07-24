import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface ChatTabProps {
  snapshot: TelemetrySnapshot;
  onSubmitChatGoal: (chatPrompt: string) => void;
}

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'ALICE' | 'BOB' | 'CHARLIE' | 'SYSTEM';
  text: string;
  timestamp: string;
}

export const ChatTab: React.FC<ChatTabProps> = ({ snapshot, onSubmitChatGoal }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm1', sender: 'SYSTEM', text: 'SE-OS Interactive Chat Session Ready. Type any feature request to evolve project.', timestamp: new Date().toLocaleTimeString() },
    { id: 'm2', sender: 'ALICE', text: 'Project structure initialized. Ready for user prompt commands.', timestamp: new Date().toLocaleTimeString() },
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

    const aliceMsg: ChatMessage = {
      id: `m-${Date.now() + 1}`,
      sender: 'ALICE',
      text: `Received feature request: "${text}". Decomposing task and dispatching to Bob (Backend) and Charlie (QA)...`,
      timestamp: new Date().toLocaleTimeString(),
    };

    const bobMsg: ChatMessage = {
      id: `m-${Date.now() + 2}`,
      sender: 'BOB',
      text: `Executing code modification for "${text}" using Codex CLI. Updating workspace files...`,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg, aliceMsg, bobMsg]);
    setInputVal('');
    onSubmitChatGoal(text);
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
            <Text bold color={m.sender === 'USER' ? 'yellow' : m.sender === 'ALICE' ? 'cyan' : m.sender === 'BOB' ? 'green' : 'purple'}>
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
        <Text color="gray">* Project continues evolving in place. Never restart to add features.</Text>
      </Box>
    </Box>
  );
};
