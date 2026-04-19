import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { LaneManager } from '../lane-manager.js';
import { LanePane } from './lane-pane.js';
import { StatusBar } from './status-bar.js';
import { LaneState, LaneTokenUsage } from '../types.js';
import { handleCommand } from '../commands/handler.js';

interface AppProps {
  manager: LaneManager;
  initialMessage?: string;
}

export function App({ manager, initialMessage }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [lanes, setLanes] = useState<LaneState[]>(manager.listLanes());
  const [activeId, setActiveId] = useState<string | null>(manager.getActiveLane()?.id ?? null);
  const [tokens, setTokens] = useState<LaneTokenUsage>(manager.getTotalTokens());
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<string | undefined>(initialMessage);
  const [noticeColor, setNoticeColor] = useState<string | undefined>('green');
  const [, forceRender] = useState(0);

  const refreshLanes = useCallback(() => {
    setLanes(manager.listLanes());
    setActiveId(manager.getActiveLane()?.id ?? null);
    setTokens(manager.getTotalTokens());
  }, [manager]);

  useEffect(() => {
    const onEvent = () => {
      setLanes(manager.listLanes());
      setTokens(manager.getTotalTokens());
      forceRender((n) => n + 1);
    };
    const onLanesChanged = () => refreshLanes();
    const onActiveChanged = (id: string) => {
      setActiveId(id);
      refreshLanes();
    };
    manager.on('event', onEvent);
    manager.on('lanes-changed', onLanesChanged);
    manager.on('active-changed', onActiveChanged);
    return () => {
      manager.off('event', onEvent);
      manager.off('lanes-changed', onLanesChanged);
      manager.off('active-changed', onActiveChanged);
    };
  }, [manager, refreshLanes]);

  useInput((_, key) => {
    if (key.ctrl && _ === 'n') {
      cycleLane(1);
    } else if (key.ctrl && _ === 'p') {
      cycleLane(-1);
    }
  });

  const cycleLane = (dir: number) => {
    if (lanes.length === 0) return;
    const idx = lanes.findIndex((l) => l.id === activeId);
    const next = (idx + dir + lanes.length) % lanes.length;
    manager.setActiveLane(lanes[next].id);
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;
    setInput('');

    if (value.startsWith('/')) {
      if (value.trim() === '/quit' || value.trim() === '/exit') {
        exit();
        return;
      }
      const result = await handleCommand(value, manager);
      if (result) {
        setNotice(result.message);
        setNoticeColor(result.ok ? 'green' : 'red');
        refreshLanes();
      }
      return;
    }

    const active = manager.getActiveLane();
    if (!active) {
      setNotice('No active lane. Create one with /new <name>');
      setNoticeColor('red');
      return;
    }

    setNotice(`→ ${active.name}: ${value.slice(0, 60)}${value.length > 60 ? '...' : ''}`);
    setNoticeColor('cyan');
    active.send(value).catch((err) => {
      setNotice(`Error: ${err.message}`);
      setNoticeColor('red');
    });
  };

  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 30;
  const visibleLanes = pickVisibleLanes(lanes, activeId, termWidth);
  const paneWidth = visibleLanes.length > 0 ? Math.floor((termWidth - 2) / visibleLanes.length) : termWidth;
  const paneHeight = Math.max(10, termHeight - 8);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {visibleLanes.length === 0 ? (
        <Box
          borderStyle="round"
          borderColor="cyan"
          padding={1}
          flexDirection="column"
          height={paneHeight}
        >
          <Text bold color="cyan">Welcome to Lane Manager</Text>
          <Text> </Text>
          <Text>No lanes yet. Get started:</Text>
          <Text color="yellow">  /new my-lane</Text>
          <Text color="yellow">  /new portal --template ics-portal</Text>
          <Text color="yellow">  /templates            (list ICS repo templates)</Text>
          <Text color="yellow">  /restore              (reload saved lanes)</Text>
          <Text color="yellow">  /help                 (see all commands)</Text>
        </Box>
      ) : (
        <Box>
          {visibleLanes.map((l) => (
            <LanePane
              key={l.id}
              lane={l}
              focused={l.id === activeId}
              width={paneWidth}
              height={paneHeight}
            />
          ))}
        </Box>
      )}
      <StatusBar
        lanes={lanes}
        activeName={lanes.find((l) => l.id === activeId)?.name ?? null}
        tokens={tokens}
        notice={notice}
        noticeColor={noticeColor}
      />
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan">› </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}

function pickVisibleLanes(lanes: LaneState[], activeId: string | null, termWidth: number): LaneState[] {
  if (lanes.length === 0) return [];
  const maxVisible = Math.max(1, Math.min(3, Math.floor(termWidth / 50)));
  if (lanes.length <= maxVisible) return lanes;
  const activeIdx = Math.max(0, lanes.findIndex((l) => l.id === activeId));
  const start = Math.max(0, Math.min(lanes.length - maxVisible, activeIdx - Math.floor(maxVisible / 2)));
  return lanes.slice(start, start + maxVisible);
}
