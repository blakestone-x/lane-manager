import type Anthropic from '@anthropic-ai/sdk';

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file from the lane\'s working directory. Returns up to 2000 lines by default.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file.' },
        offset: { type: 'number', description: 'Line number to start reading from (1-indexed).' },
        limit: { type: 'number', description: 'Max number of lines to read.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file. Overwrites if file exists. Creates parent directories as needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to write to.' },
        content: { type: 'string', description: 'Content to write.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace old_string with new_string in a file. old_string must appear exactly once in the file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'bash',
    description:
      'Execute a shell command in the lane\'s working directory. Returns stdout/stderr. 2 minute timeout.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute.' },
        timeout: { type: 'number', description: 'Timeout in ms (default 120000).' },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory with a glob pattern.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path.' },
        pattern: { type: 'string', description: 'Optional glob pattern (e.g. "*.ts").' },
      },
      required: ['path'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents with a regex pattern.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Directory or file to search.' },
        glob: { type: 'string', description: 'Glob filter like "*.ts".' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'git_status',
    description: 'Show git status summary for the lane\'s cwd (branch, ahead/behind, dirty files).',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];
