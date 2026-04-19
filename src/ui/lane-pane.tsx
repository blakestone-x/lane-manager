import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { LaneState, LaneStatus } from '../types.js';

interface Props {
  lane: LaneState;
  focused: boolean;
  width: number;
  height: number;
}

export function LanePane({ lane, focused, width, height }: Props) {
  const statusColor = statusColorOf(lane.status);
  const borderColor = focused ? 'cyan' : 'gray';
  const messages = lane.messages.slice(-Math.max(5, height - 5));

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'double' : 'single'}
      borderColor={borderColor}
      width={width}
      height={height}
      paddingX={1}
    >
      <Box>
        <Text bold color={focused ? 'cyan' : 'white'}>
          {lane.name}
        </Text>
        <Text dimColor> | </Text>
        <Text color={statusColor}>
          {lane.status === 'running' ? <Spinner type="dots" /> : '●'} {lane.status}
        </Text>
        <Text dimColor> | </Text>
        <Text dimColor>
          in:{lane.tokens.input} out:{lane.tokens.output}
        </Text>
      </Box>
      <Box>
        <Text dimColor>{lane.cwd}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {messages.map((m, i) => (
          <MessageLine key={i} role={m.role} content={m.content} toolName={m.toolName} />
        ))}
      </Box>
    </Box>
  );
}

function MessageLine({
  role,
  content,
  toolName,
}: {
  role: string;
  content: string;
  toolName?: string;
}) {
  const roleColor = roleColorOf(role);
  const prefix = prefixOf(role, toolName);
  const truncated = content.length > 300 ? content.slice(0, 297) + '...' : content;

  return (
    <Box>
      <Text color={roleColor} bold>
        {prefix}{' '}
      </Text>
      <Text wrap="wrap">{truncated}</Text>
    </Box>
  );
}

function statusColorOf(s: LaneStatus): string {
  switch (s) {
    case 'running':
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
