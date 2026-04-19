import React from 'react';
import { Box, Text } from 'ink';
import { LaneState, LaneTokenUsage } from '../types.js';

interface Props {
  lanes: LaneState[];
  activeName: string | null;
  tokens: LaneTokenUsage;
  notice?: string;
  noticeColor?: string;
}

export function StatusBar({ lanes, activeName, tokens, notice, noticeColor }: Props) {
  const counts = lanes.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Box>
        <Text bold>Lane Manager</Text>
        <Text dimColor> | </Text>
        <Text>
          {lanes.length} lanes
        </Text>
        <Text dimColor> | </Text>
        {Object.entries(counts).map(([status, n]) => (
          <React.Fragment key={status}>
            <Text color={statusColor(status)}>
              {status}:{n}
            </Text>
            <Text> </Text>
          </React.Fragment>
        ))}
        <Text dimColor>| active: </Text>
        <Text color="cyan">{activeName || '(none)'}</Text>
        <Text dimColor>
          {' '}
          | tok in:{tokens.input} out:{tokens.output}
        </Text>
      </Box>
      {notice && (
        <Box>
          <Text color={noticeColor || 'yellow'}>{notice}</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>
          Enter=send  /help=commands  Ctrl+N/P=switch lane  Ctrl+C=quit
        </Text>
      </Box>
    </Box>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'running':
      return 'yellow';
    case 'idle':
      return 'green';
    case 'paused':
      return 'blue';
    case 'error':
      return 'red';
    default:
      return 'white';
  }
}
