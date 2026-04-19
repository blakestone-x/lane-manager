import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { LaneState, LaneStatus, LaneMessage } from '../types.js';

interface Props {
  lane: LaneState;
  focused: boolean;
  width: number;
  height: number;
  inputValue: string;
  onInputChange: (v: string) => void;
  onInputSubmit: (v: string) => void;
}

export function LanePane({
  lane,
  focused,
  width,
  height,
  inputValue,
  onInputChange,
  onInputSubmit,
}: Props) {
  const statusColor = statusColorOf(lane.status);
  const borderColor = focused ? 'cyan' : 'gray';
  const borderStyle = focused ? 'double' : 'single';

  const headerLines = 3;
  const inputLines = 3;
  const bodyHeight = Math.max(4, height - headerLines - inputLines);
  const visible = pickVisibleMessages(lane.messages, bodyHeight, width);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box
        borderStyle={borderStyle}
        borderColor={borderColor}
        flexDirection="column"
        paddingX={1}
        width={width}
      >
        <Box>
          <Text bold color={focused ? 'cyan' : 'white'}>
            {lane.name}
          </Text>
          <Text dimColor> </Text>
          <Text color={statusColor}>
            {lane.status === 'running' || lane.status === 'starting' ? (
              <Spinner type="dots" />
            ) : (
              '●'
            )}{' '}
            {lane.status}
          </Text>
        </Box>
        <Box>
          <Text dimColor>{shortenPath(lane.cwd, width - 4)}</Text>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        borderStyle={borderStyle}
        borderColor={borderColor}
        paddingX={1}
        width={width}
        height={bodyHeight + 2}
      >
        {visible.length === 0 ? (
          <Text dimColor italic>
            {lane.status === 'starting'
              ? 'Starting Claude Code session...'
              : 'No messages yet. Type below to chat.'}
          </Text>
        ) : (
          visible.map((m, i) => (
            <MessageBlock key={i} message={m} maxWidth={width - 4} />
          ))
        )}
      </Box>

      <Box
        borderStyle={borderStyle}
        borderColor={focused ? 'cyan' : 'gray'}
        paddingX={1}
        width={width}
      >
        {focused ? (
          <>
            <Text color="cyan">› </Text>
            <TextInput
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onInputSubmit}
              placeholder="message this lane..."
            />
          </>
        ) : (
          <Text dimColor>  (focus to chat — Tab / Ctrl+N)</Text>
        )}
      </Box>
    </Box>
  );
}

function MessageBlock({ message, maxWidth }: { message: LaneMessage; maxWidth: number }) {
  const prefix = prefixOf(message.role, message.toolName);
  const color = roleColorOf(message.role);
  const label = labelOf(message.role, message.toolName);
  const body = truncateForPane(message.content, maxWidth * 4);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {prefix} {label}
        </Text>
      </Box>
      <Box>
        <Text wrap="wrap">{body}</Text>
      </Box>
    </Box>
  );
}

function pickVisibleMessages(
  messages: LaneMessage[],
  bodyHeight: number,
  width: number
): LaneMessage[] {
  const approxLinesPer = (m: LaneMessage): number => {
    const chars = Math.max(1, m.content.length);
    const perLine = Math.max(20, width - 6);
    return 2 + Math.ceil(chars / perLine);
  };

  let used = 0;
  const picked: LaneMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const cost = approxLinesPer(m);
    if (used + cost > bodyHeight && picked.length > 0) break;
    picked.push(m);
    used += cost;
  }
  return picked.reverse();
}

function truncateForPane(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 3) + '...';
}

function shortenPath(p: string, max: number): string {
  if (p.length <= max) return p;
  return '…' + p.slice(p.length - (max - 1));
}

function statusColorOf(s: LaneStatus): string {
  switch (s) {
    case 'running':
      return 'yellow';
    case 'starting':
      return 'yellow';
    case 'idle':
      return 'green';
    case 'paused':
      return 'blue';
    case 'error':
      return 'red';
    case 'killed':
      return 'gray';
    default:
      return 'white';
  }
}

function roleColorOf(role: string): string {
  switch (role) {
    case 'user':
      return 'cyan';
    case 'assistant':
      return 'green';
    case 'tool':
      return 'magenta';
    case 'system':
      return 'yellow';
    default:
      return 'white';
  }
}

function prefixOf(role: string, toolName?: string): string {
  switch (role) {
    case 'user':
      return '›';
    case 'assistant':
      return '◆';
    case 'tool':
      return toolName?.endsWith(':result') ? '◇' : '⚙';
    case 'system':
      return '!';
    default:
      return '·';
  }
}

function labelOf(role: string, toolName?: string): string {
  switch (role) {
    case 'user':
      return 'you';
    case 'assistant':
      return 'claude';
    case 'tool': {
      const t = toolName ?? 'tool';
      return t.endsWith(':result') ? `result(${t.replace(':result', '')})` : t;
    }
    case 'system':
      return 'system';
    default:
      return role;
  }
}
