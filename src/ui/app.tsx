import React, { useEffect, useState, useCallback, useRef } from 'react';
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

type InputMode = 'lane' | 'command';

const MIN_PANE_WIDTH = 40;
const MAX_VISIBLE_DEFAULT = 3;

export function App({ manager, initialMessage }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [lanes, setLanes] = useState<LaneState[]>(manager.listLanes());
  const [activeId, setActiveId] = useState<string | null>(manager.getActiveLane()?.id ?? null);
  const [tokens, setTokens] = useState<LaneTokenUsage>(manager.getTotalTokens());
  const [laneInputs, setLaneInputs] = useState<Record<string, string>>({});
  const [commandInput, setCommandInput] = useState('');
  const [mode, setMode] = useState<InputMode>('lane');
  const [notice, setNotice] = useState<string | undefined>(initialMessage);
  const [noticeColor, setNoticeColor] = useState<string | undefined>('green');
  const [paneStart, setPaneStart] = useState(0);
  const [, forceRender] = useState(0);
  const termSizeRef = useRef({
    columns: stdout?.columns ?? 120,
    rows: stdout?.rows ?? 30,
  });

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

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      termSizeRef.current = { columns: stdout.columns, rows: stdout.rows };
      forceRender((n) => n + 1);
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'n') {
      cycleLane(1);
    } else if (key.ctrl && inputChar === 'p') {
      cycleLane(-1);
    } else if (key.tab && !key.shift) {
      cycleLane(1);
    } else if (key.tab && key.shift) {
      cycleLane(-1);
    } else if (key.escape) {
      if (mode === 'command') {
        setMode('lane');
        setCommandInput('');
      }
    } else if (!key.ctrl && !key.meta && inputChar === '/' && mode === 'lane') {
      const active = manager.getActiveLane();
      const laneHasText = active ? (laneInputs[active.id] ?? '').length > 0 : false;
      if (!laneHasText) {
        setMode('command');
        setCommandInput('/');
      }
    }
  });

  const cycleLane = (dir: number) => {
    if (lanes.length === 0) return;
    const idx = lanes.findIndex((l) => l.id === activeId);
    const next = (idx + dir + lanes.length) % lanes.length;
    manager.setActiveLane(lanes[next].id);
    ensureVisible(next);
  };

  const ensureVisible = (idx: number) => {
    const visibleCount = computeVisibleCount(termSizeRef.current.columns, lanes.length);
    if (idx < paneStart) setPaneStart(idx);
    else if (idx >= paneStart + visibleCount)
      setPaneStart(Math.max(0, idx - visibleCount + 1));
  };

  const handleLaneSubmit = (laneId: string, value: string) => {
    if (!value.trim()) return;
    setLaneInputs((prev) => ({ ...prev, [laneId]: '' }));

    if (value.startsWith('/')) {
      runCommand(value);
      return;
    }

    try {
      manager.sendTo(laneId, value);
    } catch (err: any) {
      setNotice(`Error: ${err.message}`);
      setNoticeColor('red');
    }
  };

  const handleCommandSubmit = async (value: string) => {
    if (!value.trim()) {
      setMode('lane');
      setCommandInput('');
      return;
    }
    setCommandInput('');
    setMode('lane');
    await runCommand(value);
  };

  const runCommand = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed === '/quit' || trimmed === '/exit') {
      manager.shutdownAll();
      exit();
      return;
    }
    const result = await handleCommand(trimmed, manager);
    if (result) {
      setNotice(result.message);
      setNoticeColor(result.ok ? 'green' : 'red');
      refreshLanes();
    }
  };

  const termWidth = termSizeRef.current.columns;
  const termHeight = termSizeRef.current.rows;
  const visibleCount = computeVisibleCount(termWidth, lanes.length);
  const visibleLanes = lanes.slice(paneStart, paneStart + visibleCount);
  const paneWidth =
    visibleLanes.length > 0
      ? Math.floor(termWidth / visibleLanes.length)
      : termWidth;
  const footerHeight = mode === 'command' ? 4 : 3;
  const paneHeight = Math.max(12, termHeight - footerHeight);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {lanes.length === 0 ? (
        <Box
          borderStyle="round"
          borderColor="cyan"
          padding={1}
          flexDirection="column"
          height={paneHeight}
        >
          <Text bold color="cyan">
            Lane Manager — multi-session Claude Code
          </Text>
          <Text> </Text>
          <Text>No lanes yet. Get started:</Text>
          <Text color="yellow">  /new my-lane</Text>
          <Text color="yellow">  /new portal --template ics-portal</Text>
          <Text color="yellow">  /templates         list ICS repo templates</Text>
          <Text color="yellow">  /restore           reload saved lanes</Text>
          <Text color="yellow">  /help              all commands</Text>
          <Text> </Text>
          <Text dimColor>Press / to enter a command at any time.</Text>
        </Box>
      ) : (
        <Box>
          {visibleLanes.map((l) => (
            <LanePane
              key={l.id}
              lane={l}
              focused={l.id === activeId && mode === 'lane'}
              width={paneWidth}
              height={paneHeight}
              inputValue={laneInputs[l.id] ?? ''}
              onInputChange={(v) =>
                setLaneInputs((prev) => ({ ...prev, [l.id]: v }))
              }
              onInputSubmit={(v) => handleLaneSubmit(l.id, v)}
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
        visibleRange={lanes.length > 0 ? { start: paneStart, count: visibleLanes.length } : null}
        mode={mode}
      />

      {mode === 'command' && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>
            cmd ›{' '}
          </Text>
          <TextInput
            value={commandInput}
            onChange={setCommandInput}
            onSubmit={handleCommandSubmit}
          />
        </Box>
      )}
    </Box>
  );
}

function computeVisibleCount(termWidth: number, laneCount: number): number {
  if (laneCount === 0) return 0;
  const maxByWidth = Math.max(1, Math.floor(termWidth / MIN_PANE_WIDTH));
  return Math.min(MAX_VISIBLE_DEFAULT, maxByWidth, laneCount);
}
