import React from 'react';
import { Box, Text } from 'ink';
import { LaneState, LaneTokenUsage } from '../types.js';

interface Props {
  lanes: LaneState[];
  activeName: string | null;
  tokens: LaneTokenUsage;
  notice?: string;
  noticeColor?: string;
  visibleRange: { start: number; count: number } | null;
  mode: 'lane' | 'command';
}

export function StatusBar({
  lanes,
  activeName,
  tokens,
  notice,
  noticeColor,
  visibleRange,
  mode,
}: Props) {
  const counts = lanes.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const visibleLabel = visibleRange
    ? `panes ${visibleRange.start + 1}-${visibleRange.start + visibleRange.count}/${lanes.length}`
    : null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Box>
        <Text bold color="cyan">
          Lane Manager
        </Text>
        <Text dimColor> │ </Text>
        <Text>{lanes.length} lanes</Text>
        {visibleLabel && (
          <>
            <Text dimColor> │ </Text>
            <Text dimColor>{visibleLabel}</Text>
          </>
        )}
        <Text dimColor> │ </Text>
        {Object.entries(counts).map(([status, n]) => (
          <React.Fragment key={status}>
            <Text color={statusColor(status)}>
              {status}:{n}
            </Text>
            <Text> </Text>
          </React.Fragment>
        ))}
        <Text dimColor>│ focus: </Text>
        <Text color="cyan">{activeName || '(none)'}</Text>
        <Text dimColor>
          {' '}
          │ tok {tokens.input}in/{tokens.output}out
          {tokens.costUsd > 0 ? ` $${tokens.costUsd.toFixed(4)}` : ''}
        </Text>
      </Box>
      {notice && (
        <Box>
          <Text color={noticeColor || 'yellow'}>{notice}</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>
          {mode === 'command'
            ? 'ESC cancel │ Enter run'
            : 'Tab switch │ / command │ Enter send │ Ctrl+C quit'}
        </Text>
      </Box>
    </Box>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'running':
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
